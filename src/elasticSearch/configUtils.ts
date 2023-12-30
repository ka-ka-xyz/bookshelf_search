import { useState } from "react";


const ES_URL_KEY = "ES_URL";
const ES_USER_KEY = "ES_USER";
const ES_PASSWORD_KEY = "ES_PASSWORD";
const ES_INDEX_KEY = "ES_INDEX";
const HIGHLIGHT_SIZE_KEY = "HIGHLIGHT_SIZE";
const PAGE_SIZE_KEY = "PAGE_SIZE";

export type ConfigProps = {
    esUrl: string,
    setEsUrl: (s: string) => void,
    esUser: string | null,
    setEsUser: (s: string | null) => void,
    esPassword: string | null,
    setEsPassword: (s: string | null) => void,
    esIndex: string,
    setEsIndex: (s: string) => void,
    highlightSize: number,
    setHighlightSize: (n: number) => void,
    pageSize: number,
    setPageSize: (n: number) => void,
}

export const useConfig = (): ConfigProps => {
    const [esUrl, _setEsUrl] = useState(localStorage.getItem(ES_URL_KEY) ?? "http://localhost:9200");
    const [esUser, _setEsUser] = useState(localStorage.getItem(ES_USER_KEY));
    const [esPassword, _setEsPassword] = useState(localStorage.getItem(ES_PASSWORD_KEY));
    const [esIndex, _setEsIndex] = useState(localStorage.getItem(ES_INDEX_KEY) ?? "bookshelf_search");
    const [highlightSize, _setHighlightSize] = useState(parseInt(localStorage.getItem(HIGHLIGHT_SIZE_KEY) ?? "100", 10));
    const [pageSize, _setPageSize] =  useState(parseInt(localStorage.getItem(PAGE_SIZE_KEY) ?? "10", 10));

    const setEsUrl = (s: string) => {
        _setEsUrl(s);
        localStorage.setItem(ES_URL_KEY, s);
    };

    const setEsUser = (s: string | null) => {
        _setEsUser(s);
        if (s == null) {
            localStorage.removeItem(ES_USER_KEY);
        } else {
            localStorage.setItem(ES_USER_KEY, s);
        }
    };

    const setEsPassword = (s: string | null) => {
        _setEsPassword(s);
        if (s == null) {
            localStorage.removeItem(ES_PASSWORD_KEY);
        } else {
            localStorage.setItem(ES_PASSWORD_KEY, s);
        }
    };

    const setEsIndex = (s: string) => {
        _setEsIndex(s);
        localStorage.setItem(ES_INDEX_KEY, s);
    };
    const setHighlightSize = (n: number) => {
        _setHighlightSize(n);
        localStorage.setItem(HIGHLIGHT_SIZE_KEY, `${Math.floor(n)}`);
    };
    const setPageSize = (n: number) => {
        _setPageSize(n);
        localStorage.setItem(PAGE_SIZE_KEY, `${Math.floor(n)}`);
    };

    return {
        esUrl, setEsUrl,
        esUser, setEsUser,
        esPassword, setEsPassword,
        esIndex, setEsIndex,
        highlightSize, setHighlightSize,
        pageSize, setPageSize,
    };
}