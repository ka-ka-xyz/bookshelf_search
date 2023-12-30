import { useState, useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import React from "react";
import {
  Card,
  CardHeader,
  CardContent,
  Collapse,
  Button,
  Stack,
  IconButton,
  IconButtonProps,
  Typography,
  List,
  ListItem,
  ListItemText,
  TextField,
  Divider,
  Paper,
  Dialog,
  DialogContent,
  DialogActions,
  DialogTitle,
  Pagination,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Checkbox,
  Chip,
  Snackbar,
 } from "@mui/material";
 import CheckIcon from "@mui/icons-material/Check";
 import ClearIcon from "@mui/icons-material/Clear";
 
import { styled } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SettingsIcon from "@mui/icons-material/Settings";
import { HitsInfo, searchEs, SearchResult } from "./elasticSearch/esUtils";
import { useConfig, ConfigProps } from "./elasticSearch/configUtils";
import { existsSync } from "fs";


type SearchResultInfo = {
  result: SearchResult,
  page: number,
  error: unknown | undefined,
}


const searchReducer = (
  current: SearchResultInfo,
  action: {
    type: "FETCH" | "CLEAR_ERROR" | "CLEAR_LIST",
    payload: SearchResultInfo
  }): SearchResultInfo => {

  if (action.type === "CLEAR_ERROR" || action.type === "CLEAR_LIST") {
    return INITIAL_STATE;
  }

  if (action.payload.error) {
    return {
      result: {
        total: 0,
        hits: [],
      },
      error: action.payload.error,
      page: 1,
    };
  }
  if (action.payload.result.total === 0) {
    return INITIAL_STATE;
  }
  return action.payload;
}

const INITIAL_STATE = {
  result: {
    total: 0,
    hits: [],
  },
  error: undefined,
  page: 1,
};
async function callFileExists(pathStr: string): Promise<boolean> {
  // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  return await invoke("file_exists", { pathStr });
}

function App() {
  const cfg = useConfig();

  const [queryStr, setQueryStr] = useState("");
  const [expandeds, setExpandeds] = useState<string[]>([]);
  const [openConfig, setOpenConfig] = useState(false);

  const [listState, dispatch] = useReducer(searchReducer, INITIAL_STATE);
  const [loading, setLoading] = useState(false);



  const search = async (query: string, nextPage: number): Promise<void> => {

    if (query === "") {
      dispatch({ type: "CLEAR_LIST", payload: INITIAL_STATE });
      setExpandeds([]);
      return;
    }
    try {
      setLoading(true);
      const rlt = await searchEs(query, {
        index: cfg.esIndex,
        baseUrl: cfg.esUrl,
        auth: (cfg.esUser != null && cfg.esPassword != null) ?
        {
          user: cfg.esUser,
          password: cfg.esPassword,
        } : undefined,
      },{
        size: cfg.pageSize,
        from: (nextPage -1) * cfg.pageSize,
        highlightSize: cfg.highlightSize
      });
      dispatch({ type: "FETCH", payload: {
        result: rlt,
        page: nextPage,
        error: undefined,
      } });
      setExpandeds([]);
    } catch (e) {
      dispatch({ type: "FETCH", payload: {...INITIAL_STATE, error: e } });
      setExpandeds([]);
    } finally {
      setLoading(false);
    }
  }

  const renderListItem = (): React.ReactNode => {
    if (loading) {
      return (
        <Stack alignItems="center">
          <CircularProgress />
        </Stack>
      );
    }
    if (listState.result == null) {
      return <></>;
    }
    return listState.result.hits.map((h, idx) => {
      return (
        <ResultCard
          key={"result_" + idx}
          h={h}
          expand={expandeds.indexOf(h.id) > -1}
          handleExpandClick={(id: string) => {
            if (expandeds.indexOf(h.id) > -1) {
              setExpandeds(expandeds.filter((e) => e !== h.id));
            } else {
              setExpandeds([...expandeds, h.id]);
            }
          }}
          onClickChip={async (chipStr: string) => {
            const nextQuery = queryStr == "" ? chipStr : `${queryStr} AND ${chipStr}`;
            setQueryStr(nextQuery);
            dispatch({type: "CLEAR_LIST", payload: listState});
            search(nextQuery, 1);
          }}
        />
      );
    });
  }


  return (
    <Paper style={{width:"100%", height: "100%", display: "flex", flexDirection: "column" }} >
        <div style={{ flexGrow: 1, marginRight: "0px", marginLeft: "0px", padding: "10px" }}>
          <Stack spacing={2} direction="row">
            <TextField
              fullWidth
              value={queryStr}
              label="キーワード"
              onChange={(e) => {
                setQueryStr(e.target.value);
              }}
              onKeyDown={async (e) => {
                if (e.code.toLowerCase() === "enter") {
                  dispatch({type: "CLEAR_LIST", payload: listState});
                  search(queryStr, 1);
                }
              }}
            />
            <IconButton
              type="button"
              sx={{ p: '10px' }}
              onClick={()=> {
                setQueryStr("");
                dispatch({type: "CLEAR_LIST", payload: INITIAL_STATE});
              }} >
              <ClearIcon />
            </IconButton>
            <Button
              variant="contained"
              onClick={async () => {
                dispatch({type: "CLEAR_LIST", payload: listState});
                search(queryStr, 1);
              }}
            >
              検索
            </Button>
            <IconButton size="large" onClick={() => setOpenConfig(true)}>
              <SettingsIcon />
            </IconButton>
          </Stack>
        </div>
        <Divider/>
      <div>
        {listState.result? <Stack sx={{margin: "20px"}} direction="row" justifyContent="end"><div>{listState.result.total} 件一致</div></Stack> : <></>}
        {renderListItem()}
      </div>
      <Divider/>
      <div style={{ width: "100%" }}>
        {
          listState.result ?
            <Stack spacing={2} direction="row" justifyContent={"end"} sx={{ paddingTop: "10px", paddingBottom: "10px", marginRight: "50px", flex: 0}}> 
              <Pagination
                count={Math.floor(listState.result.total / cfg.pageSize) + 1}
                page={listState.page}
                onChange={async (e, p) => {
                  search(queryStr, p);
                }}
              />
            </Stack>:
            null
        }
      </div>
      <ConfigDialog
        open={openConfig}
        setOpen={setOpenConfig}
        {...cfg}
          />
      <ErrorDialog error={listState.error} clearError={() => dispatch({ type: "CLEAR_ERROR", payload: listState })} />
    </Paper>
  );
}

export default App;


const showErrorMsg = (e: unknown | undefined):string => {
  if (e instanceof Error) {
    return e.message;
  }
  return e == null ? "" : JSON.stringify(e);
  
}

function ErrorDialog(props: {
  error: unknown | undefined,
  clearError: () => void,
}) {
  
  return (
    <Dialog open={props.error != null} fullWidth>
      <DialogTitle>
        エラー
      </DialogTitle>
      <DialogContent>
        {showErrorMsg(props.error)}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.clearError}>OK</Button>
      </DialogActions>
    </Dialog>
    );
}

function ConfigDialog(props: {
  open: boolean,
  setOpen: (b: boolean) => void,
} & ConfigProps) {
  const {
    esIndex,
    esUrl,
    esUser,
    esPassword,
    highlightSize,
    pageSize,
    setEsIndex,
    setEsUrl,
    setEsUser,
    setEsPassword,
    setHighlightSize,
    setPageSize,
    open,
    setOpen
  } = props;
  const [tmpEsIndex, setTmpEsIndex] = useState(esIndex);
  const [tmpEsUrl, setTmpEsUrl] = useState(esUrl);
  const [tmpEsUser, setTmpEsUser] = useState(esUser ?? "");
  const [tmpEsPassword, setTmpEsPassword] = useState(esPassword ?? "");
  const [tmpHighlightSize, setTmpHighlightSize] = useState(highlightSize);
  const [tmpPageSize, setTmpPageSize] = useState(pageSize);
  const [enableAuthInput, setEnableAuthInput] = useState(esUser != null && esPassword != null);

  useEffect(() => {
    if (open) {
      setTmpEsIndex(esIndex);
      setTmpEsUrl(esUrl);
      setTmpHighlightSize(highlightSize);
      setTmpPageSize(pageSize);
      if (esUser != null && esPassword != null) {
        setEnableAuthInput(true);    
        setTmpEsUser(esUser);
        setTmpEsPassword(esPassword);
      } else {
        setEnableAuthInput(false);    
        setTmpEsUser("");
        setTmpEsPassword("");
        }
      
    }
  }, [open])
  return (
  <Dialog open={open} fullWidth>
    <DialogTitle>
      設定
    </DialogTitle>
    <DialogContent>
      <Stack spacing={2}>
        <TextField
          type="url"
          sx={{ marginTop: "20px"}}
          fullWidth
          label="Elasticsearch URL"
          value={tmpEsUrl}
          onChange={(e) => setTmpEsUrl(e.target.value)}/>
        <Divider />
        <FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={enableAuthInput}
                onChange={() => setEnableAuthInput(!enableAuthInput)}
              />}
            label="認証"
          />
        </FormControl>
        <TextField
          fullWidth
          label="User"
          disabled={!enableAuthInput}
          value={tmpEsUser}
          onChange={(e) => setTmpEsUser(e.target.value)} />
        <TextField
          fullWidth
          label="Password"
          type="password"
          disabled={!enableAuthInput}
          value={tmpEsPassword}
          onChange={(e) => setTmpEsPassword(e.target.value)} />
        <Divider />
        <TextField
          fullWidth
          label="Index"
          value={tmpEsIndex}
          onChange={(e) => setTmpEsIndex(e.target.value)} />
        <TextField
          fullWidth
          type="number"
          label="一致箇所件数"
          value={tmpHighlightSize}
          onChange={(e) => setTmpHighlightSize(parseInt(e.target.value, 10))} />
        <TextField
          fullWidth
          type="number"
          label="ページサイズ"
          value={tmpPageSize}
          onChange={(e) => setTmpPageSize(parseInt(e.target.value, 10))} />
      </Stack>

    </DialogContent>
    <DialogActions>
        <Button onClick={() => {
          setOpen(false);
        }}>キャンセル</Button>
        <Button variant="contained" startIcon={<CheckIcon />} onClick={() => {
          setEsIndex(tmpEsIndex);
          setEsUrl(tmpEsUrl);
          if (enableAuthInput) {
            setEsUser(tmpEsUser);
            setEsPassword(tmpEsPassword);
          } else {
            setEsUser(null);
            setEsPassword(null);
          }
          setHighlightSize(tmpHighlightSize);
          setPageSize(tmpPageSize);
          setOpen(false);
        }}>保存</Button>
    </DialogActions>
  </Dialog>
  );
}

function ResultCard(props: {
  h: HitsInfo,
  expand?: boolean,
  handleExpandClick: (id: string) => void,
  onClickChip: (chipStr: string) => Promise<void>,
}) {
  const { h, expand = false, handleExpandClick, onClickChip } = props;
  const [exists, setExists] = useState<boolean | undefined>(undefined);
  const [copyMsg, setCopyMsg] = useState<string | undefined>(undefined);

  useEffect(() => {
    const path = decodeURI(h.url).slice(8);
    callFileExists(path).then((r) => {
      setExists(r)
    })
  }, [h.url]);
  
  interface ExpandMoreProps extends IconButtonProps {
    expand: boolean;
  }
  const ExpandMore = styled((props: ExpandMoreProps) => {
    const { expand, ...other } = props;
    return <IconButton {...other} />;
  })(({ theme, expand }) => ({
    transform: !expand ? "rotate(0deg)" : "rotate(180deg)",
    marginLeft: "auto",
    transition: theme.transitions.create("transform", {
      duration: theme.transitions.duration.shortest,
    }),
  }));
  
  const renderHighlights = (str: string): React.ReactNode => {
    return str.split(/<em>/).map((s, idx) => {
      const [s1, s2] = s.split(/<\/em>/);
      if (s2 == null) {
        return s1;
      }
      return (<React.Fragment key={`h_${idx}`}><span style={{ fontWeight: "900", textDecoration: "underline" }}>{s1}</span>{s2}</React.Fragment>)
    });
  }

  return (
    <>
      <Card sx={{ margin: "20px" }}>
        <CardHeader
          title={<Typography variant="h6">{h.title}</Typography>}
          action={
            <ExpandMore
              expand={expand}
              onClick={() => handleExpandClick(h.id)}
            >
              <ExpandMoreIcon />
            </ExpandMore>
          }
        />
        <CardContent>
          <div>
            <div>場所: <a
              href=""
              onClick={(e) => {
                e.preventDefault();
                if (exists) {
                  window.navigator.clipboard.writeText(decodeURI(h.url).slice(8));
                  setCopyMsg("ファイルパスをクリップボードにコピーしました。");
                } else {
                  window.navigator.clipboard.writeText((/[^/]*$/.exec(decodeURI(h.url)) ?? [""])[0]);
                  setCopyMsg("ファイル名をクリップボードにコピーしました。");
                }
                
              }}
              rel="noopener noreferrer">{decodeURI(h.url).slice(8)}
              </a>
            </div>
            <div>頻出語句: {(h.kwds ?? []).map((s, idx) => {
              return (
                <Chip
                  key={`kwd_${idx}`}
                  label={`${s}`}
                  variant="outlined"
                  sx={{marginRight: "10px", marginTop: "5px"}}
                  onClick={() => onClickChip(s)}
                />);
                })}
            </div>
          </div>
        </CardContent>
        <Collapse in={expand} timeout="auto">
          <CardContent>
            <div>
              <p>一致箇所</p>
            </div>
            <List>
              {h.highlights.map((hl, idx) => {
                return (
                  <>
                    <ListItem key={`highlights_${idx}`}>
                      <ListItemText secondary={renderHighlights(hl)}/>
                    </ListItem>
                    <Divider />
                  </>
                );
              })}
            </List>
          </CardContent>
        </Collapse>
      </Card>
      <Snackbar
        open={copyMsg != null}
        autoHideDuration={5000}
        message={copyMsg}
        onClose={() => setCopyMsg(undefined)}
      />
    </>
  );
}