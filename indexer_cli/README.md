# indexer_cliについて

OCRテキストを含むpdfファイルからテキストを抜き出し、Elasticsearchへ登録するためのコマンドラインツールです。

注意点として、絶対に不特定多数からElasticsearchの内容を自由に参照できる状態にはしないでください。あくまで私的複製の範囲内で使用してください。

## 必要な環境

### Python

Python3系。手元環境ではPython 3.11.3。pythonおよびpipにPATHが通っている必要があります。

### pdftotext

インデックス登録CLI(indexer_cli) でPDFファイルからOCRテキストを抜き出すため、pdftotextコマンドを利用可能にします。

下記サイトでダウンロードしてインストールするか

https://www.xpdfreader.com/download.html

あるいは、下記のようにchocolatery経由でインストールしてください。

https://community.chocolatey.org/packages/xpdf-utils 

### pdftotext 日本語対応

https://www.xpdfreader.com/download.html

から「Download language support packages for Xpdf:」の"Japanese"( https://dl.xpdfreader.com/xpdf-japanese.tar.gz ) をダウンロードします。

解凍したファイルを https://blue-red.ddo.jp/~ao/wiki/wiki.cgi?page=PDF%A4%AB%A4%E9%A5%C6%A5%AD%A5%B9%A5%C8%A4%F2%C3%EA%BD%D0%A4%B9%A4%EB などを参考に配置してください。

chocolatery経由でインストールした場合、` %ChocolateyInstall%\bin\japanese`配下に配置してください。

### pdftotext 設定ファイルの更新

`indexer_cli\xpdfrc`をテキストエディタで開き、`D:\chocolatey\bin\japanese`となっている箇所を環境に合わせて一括置換してください。


## インデックス登録

初回登録時に下記操作を実行してください。

```
> install_pip.bat
```

最低限の引数で実行するための`doIndex.bat`を使用した場合、以下のような引数でインデックスを登録できます

- 第1引数: pdfファイルを置いているフォルダのパス
- 第2引数: ElasticsearchユーザーID
- 第3引数: Elasticsearchパスワード
- 第4引数:  YYYY-MM-DD形式の日付。更新日がこの日付以降のファイルのみクロール対象

例

```
> .\doIndex.bat C:\bookfolder\ elastic $password_string 2023-05-20
```

実行時に`YYYY_MM_DD_hh_mm_ss-indexing.log`が出力されます。


indexer.pyを直接指定する場合のオプションは以下の通り。使用前に環境変数`PYTHONPATH`を指定してください。

```
> set PYTHONPATH=.\modules
> python indexer.py --help
usage: indexer.py [-h] -d DIRECTORY [-x XPDFRC] [-e ESURL] [-U ESUSER] [-P ESPASSWORD] [-i INDEX] [-p PARALLEL]
                  [-s SLEEP] [-f FILTER_IGNORE_BEFORE]

options:
  -h, --help            show this help message and exit
  -d DIRECTORY, --directory DIRECTORY
                        検索ディレクトリ
  -x XPDFRC, --xpdfrc XPDFRC
                        pdftotext設定ファイル
  -e ESURL, --esurl ESURL
                        Elasticsearch URL
  -U ESUSER, --esuser ESUSER
                        Elasticsearchユーザー
  -P ESPASSWORD, --espassword ESPASSWORD
                        Elasticsearchパスワード
  -i INDEX, --index INDEX
                        Elasticsearch index prefix
  -p PARALLEL, --parallel PARALLEL
                        並行実行数
  -s SLEEP, --sleep SLEEP
                        スレッド開始時の待機時間
  -f FILTER_IGNORE_BEFORE, --filter_ignore_before FILTER_IGNORE_BEFORE
                        YYYY-MM-DD形式の日付。更新日がこの日付以降のファイルのみクロール対象
```


