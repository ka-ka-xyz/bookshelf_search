import { invoke } from "@tauri-apps/api/tauri";

type MultiMatch = {
    multi_match: {
        type: "phrase",
        query: string,
        fields: ["content", "content.ja", "title"]
    }
}

type BoolQuery = {
    bool: {
        must: (MultiMatch | BoolQuery)[],
        should: (MultiMatch | BoolQuery)[],
    }
  };

type Clause = "must" | "should";

export type HitsInfo = {
    id: string, //
    score: number, //_score
    url: string,  //_srouce.url
    title: string, //_srouce.title
    kwds: string[], //_srouce.kwds
    highlights: string[] //_srouce.highlight.content or content.ja
}

export type SearchResult = {
    total: number, //hits.total.value
    hits: HitsInfo[],
}

export const searchEs = async (
    words: string,
    es: {
        index: string,
        baseUrl: string,
        auth?: {
            user: string,
            password: string,
        }
    },
    params: {
        size: number,
        from: number,
        highlightSize: number,
    }
    ): Promise<SearchResult> => {
    
    const boolQuery = parseQueryStr(words);
    const query = {
        size: params.size,
        from: params.from,
        query: boolQuery,
        highlight: {
            fields: {
                  "content*": {}
            },
            fragment_size: 150,
            number_of_fragments: params.highlightSize
        },
          _source : ["title","url","highlight","lang", "kwds"]
      };
      console.log("query:" + JSON.stringify(query));

      const authStr = es.auth ? "Basic " + window.btoa(`${es.auth.user}:${es.auth.password}`) : "";

      const url = `${es.baseUrl.replace(/\/+$/, "")}/${es.index}/_search`;

    let resp: { status: number, text: string } | undefined;
    try {
        const rawResp = await invoke("fetch", {
            url: url,
            authStr: authStr,
            postBodyJsonStr: JSON.stringify(query),
        });
        resp = JSON.parse(`${rawResp}`);
    } catch (e) {
        throw new Error("エラー: " + (e as Error).message);
    }
    if (resp == null) {
        throw new Error("想定外の動作");
    }
    
    if (resp.status >= 500) {
        throw new Error("Elasticsearch内部エラー " + resp.text);
    } else if (resp.status >= 400) {
        throw new Error("クライアントエラー " + resp.text);
    }
    const rtn = JSON.parse(resp.text);
    const hits = rtn.hits.hits.map((h: any) => {
        return {
            id: `${h._id}`,
            score: h._score as number,
            url: `${h._source.url}`,
            title: `${h._source.title}`,
            kwds: (h._source.kwds == null || h._source.kwds === "" ? [] : h._source.kwds) as string[],
            highlights: (h.highlight ? (h.highlight["content.ja"] ?? h.highlight["content"] ?? []): []) as string[] 
        }
    });
    return {
        total: rtn.hits.total.value,
        hits: hits
    };
}

const parseQueryStr = (queryStr: string): BoolQuery => {
    queryStr = queryStr.replace(/\s+/g, " ").trim().replace(/^AND /i, "").replace(/^OR /i, "")
    const queryTokens = queryStr.split(/[\s]/);
    let currentBoolQuery: BoolQuery = {
        bool: {
            must: [],
            should: [],
        }
    };
    let currentClause: Clause = queryTokens[1] && queryTokens[1].toUpperCase() === "OR" ? "should" : "must";
    for (const _token of queryTokens) {
        const token = _token.trim();
        if (token.toUpperCase() === "AND") {
            currentClause = "must";
        } else if (token.toUpperCase() === 'OR') {
            currentClause = "should";
        } else {
            currentBoolQuery.bool[currentClause].push({
                multi_match: {
                    type: "phrase",
                    query: token,
                    fields: ["content", "content.ja", "title"]
                }
            });
        }
    }
    return currentBoolQuery;
}


