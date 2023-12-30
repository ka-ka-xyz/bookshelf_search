import os
import datetime
from pathlib import Path
import tempfile
import shutil
import hashlib
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from dataclasses import dataclass
import argparse
from langdetect import detect
import subprocess
from elasticsearch import Elasticsearch
from elasticsearch import RequestError
from elasticsearch import ConflictError
import json
import re
import time
import logging

DEFAULT_ES_INDEX_PREFIX = "bookshelf_search"

logging.basicConfig(
    filename="{}-indexing.log".format(datetime.datetime.now().strftime("%Y_%m_%d_%H_%M_%S")),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S ",
    encoding="UTF-8"
)
logger = logging.getLogger("indexer")

@dataclass(frozen=True)
class Book:
    id: str
    url: str
    title: str
    content: str
    lang: str
    index_modified: datetime
    file_modified: datetime

parser = argparse.ArgumentParser()
parser.add_argument("-d", "--directory", required=True, type=str, help="検索ディレクトリ")
parser.add_argument("-x", "--xpdfrc", default="~/.xpdfrc", type=str, help="pdftotext設定ファイル")
parser.add_argument("-e", "--esurl", default="http://localhost:9200", type=str, help="Elasticsearch URL")
parser.add_argument("-U", "--esuser", required=False, default="", type=str, help="Elasticsearchユーザー")
parser.add_argument("-P", "--espassword", required=False, default="", type=str, help="Elasticsearchパスワード")
parser.add_argument("-i", "--index", default=DEFAULT_ES_INDEX_PREFIX, type=str, help="Elasticsearch index prefix")
parser.add_argument("-p", "--parallel", default=2, type=int, help="並行実行数")
parser.add_argument("-s", "--sleep", default=5, type=int, help="スレッド開始時の待機時間")
parser.add_argument("-f", "--filter_ignore_before", default="", type=str, help="YYYY-MM-DD形式の日付。更新日がこの日付以降のファイルのみクロール対象")

args = parser.parse_args()

INDEX_NAME = args.index

ES_CLIENT = Elasticsearch(args.esurl, timeout=180) \
    if args.esuser == "" or args.espassword == "" else \
    Elasticsearch(args.esurl, http_auth=(args.esuser, args.espassword))

INDEX_MAPPINGS=None
INDEX_SETTINGS=None
with open(Path(Path(__file__).parent, "mappings", "index_mappings.json"), encoding="UTF-8") as f:
    INDEX_MAPPINGS = json.load(f)
with open(Path(Path(__file__).parent, "mappings", "index_settings.json"), encoding="UTF-8") as f:
    INDEX_SETTINGS = json.load(f)

if not os.path.isdir(Path(args.directory)):
    logger.error("{} not found".format(args.directory))
    exit(1)

if not os.path.isfile(Path(args.xpdfrc)):
    logger.error("{} not found".format(args.xpdfrc))
    exit(1)

def detect_lang(text: str):
    ## ad-hoc but work well.
    if text.count("は") > 10 or text.count("い") > 10:
        return "ja"
    return detect(text)

def init_es_index():
    logger.info("try create {index}".format_map({
        "index": INDEX_NAME
    }))

    try:
        if not ES_CLIENT.indices.exists(index=INDEX_NAME):
            logger.info("try to create index")
            ES_CLIENT.indices.create(
                index=INDEX_NAME,
                mappings=INDEX_MAPPINGS,
                settings=INDEX_SETTINGS,
                error_trace=True
                )
            logger.info("index created.")
        else:
            logger.info("index already created.")
    except RequestError as ex:
            logger.exception("failed to create index! abort.")
            raise ex

def split_text(text):
    max_length = 3000
    result = []

    pattern = r'.*?[。︒、,\.]'
    matches = re.findall(pattern, text)
    current_length = 0
    current_result = ''
    for match in matches:
        match_length = len(match)
        if current_length + match_length <= max_length:
            current_result += match
            current_length += match_length
        else:
            result.append(current_result)
            current_result = match
            current_length = match_length
    if len(current_result) > 0:
        result.append(current_result)

    return result

def update_terms(book: Book):
    try:
        result = ES_CLIENT.termvectors(index=INDEX_NAME, id=book.id, body={
            "fields" : ["content.ja", "content"],
            "field_statistics" : True,
            "term_statistics": False,
            "offsets": False,
            "positions": False,
            "filter": {
                "max_num_terms": 20,
                "min_word_length": 4,
                "min_term_freq": 50
            }
        })
        if book.lang == "ja":
            values = result["term_vectors"]["content.ja"]["terms"].items()
        else:
            values = result["term_vectors"]["content"]["terms"].items()
        values = sorted(values, key = lambda x : x[1]["score"], reverse=True)
        #kwds = " ".join(map(str, [x[0] for x in values]))
        kwds = [x[0] for x in values]
        ES_CLIENT.update(index=INDEX_NAME, id=book.id, doc={ "kwds": kwds })
    except Exception as ex:
        logger.exception("################ extract terms error! {title} [{id}].".format_map({
            "title": book.title,
            "id": book.id
        }))
    
def post_to_es(book: Book):
    try:
        ES_CLIENT.create(index=INDEX_NAME, id=book.id, document={
        "doc_id": book.id,
        "url": book.url,
        "title": book.title,
        "content": split_text(book.content),
        "lang": book.lang,
        "index_modified": book.index_modified,
        "file_modified": book.file_modified,
        "kwds": ""
        })
        logger.info("document {title} [{id}] saved successfully.".format_map({
            "id": book.id,
            "title": book.title
        }))
        update_terms(book)
    except ConflictError:
            logger.info("document {title} [{id}] already exists.".format_map({
                "id": book.id,
                "title": book.title
            }))
    except Exception:
        logger.exception("indexing error! {title} [{id}].".format_map({
            "title": book.title,
            "id": book.id
        }))

def extract_text(p: Path, tempDir: str):
    time.sleep(args.sleep)
    if not p.exists:
        logger.error("{} not exists!")
        return

    m = hashlib.sha256()
    m.update("{}".format(p).encode("utf-8"))
    id = m.hexdigest()
    tempIn = Path(tempDir, "{}.pdf".format(id))
    tempOut = Path(tempDir, "{}.__out__.txt".format(id))
    try:
        shutil.copy(p, tempIn)
        cfg_path = args.xpdfrc if args.xpdfrc else "~/.xpdfrc"
        result = subprocess.run(
            ["pdftotext", "-nopgbrk", "-raw", "-cfg", cfg_path, tempIn, tempOut],
            shell=False)
        if result.returncode > 0:
            logger.error("pdftotext stdout: {}".format(result.stdout.decode("urf-8")))
            logger.error("pdftotext stderr: {}".format(result.stderr.decode("urf-8")))
            return
        book = None
        with open(tempOut, mode="r", encoding="UTF-8") as temp:
            content = ""
            try:
                content = temp.read()
            except Exception:
                logger.exception("failed to read content from {}".format(p))
            content = content.replace(".\n", ". ").replace(",\n", ", ").replace("\n", "")
            langCode = detect_lang(content[0:5000])
            book = Book(
                id=id,
                url=p.as_uri(),
                title=p.name,
                content=content,
                lang=langCode,
                file_modified=datetime.datetime.fromtimestamp(p.stat().st_mtime),
                index_modified=datetime.datetime.now()
            )
    except Exception:
        logger.exception("extract error! {title} [{id}].".format_map({
            "title": book.title,
            "id": book.id
        }))
    finally:
        # process killしたときのゴミを避ける
        os.remove(tempIn)
        os.remove(tempOut)

    if book:
        post_to_es(book)
    else:
        logger.error("failed to extrace text from {}".format(p))

with tempfile.TemporaryDirectory() as tempDir:
    logger.info("create tmpdir {}".format(tempDir))
    _fl = list(Path(args.directory).glob("*.pdf"))
    if args.filter_ignore_before != "":
        fromFilterDate = datetime.datetime.strptime(args.filter_ignore_before, "%Y-%m-%d")
        logger.info("ignore file modified before {}".format(fromFilterDate))
        fl = filter(lambda f: datetime.datetime.fromtimestamp(os.path.getmtime(f)) > fromFilterDate, _fl)
    else:
        fl = _fl

    parallel =  args.parallel if args.parallel else 2
    init_es_index()
    with ThreadPoolExecutor(max_workers=parallel) as executor:
        for f in fl:
            executor.submit(extract_text, f, tempDir)


    
