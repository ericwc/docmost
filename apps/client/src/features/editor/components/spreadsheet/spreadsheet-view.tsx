import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { Box, Paper, Loader, Text, useMantineColorScheme } from "@mantine/core";
import { useTranslation } from 'react-i18next';

import { createUniver, LocaleType, merge } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";

import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import '@univerjs/preset-sheets-sort/lib/index.css';

import { useCollaboration } from '../../collaboration-context';


// Helper to get or create the Y.Map for cell data of a specific sheet
function getCellsYMap(ydoc: Y.Doc, sheetId: string): Y.Map<any> {
  const root = ydoc.getMap("spreadsheets");
  let sheetMap = root.get(sheetId) as Y.Map<any> | undefined;
  if (!sheetMap) {
    sheetMap = new Y.Map();
    root.set(sheetId, sheetMap);
  }

  let cellsMap = sheetMap.get("cells") as Y.Map<any> | undefined;
  if (!cellsMap) {
    cellsMap = new Y.Map();
    sheetMap.set("cells", cellsMap);
  }

  return cellsMap;
}

// Helper to load Univer locales based on current language
async function loadLocales(locale: LocaleType) {
  switch (locale) {
    case LocaleType.ZH_CN:
      return {
        [LocaleType.ZH_CN]: merge(
          {},
          (await import('@univerjs/preset-sheets-core/locales/zh-CN')).default,
          (await import('@univerjs/preset-sheets-filter/locales/zh-CN')).default,
          (await import('@univerjs/preset-sheets-sort/locales/zh-CN')).default,
        ),
      };
    case LocaleType.EN_US:
      return {
        [LocaleType.EN_US]: merge(
          {},
          (await import('@univerjs/preset-sheets-core/locales/en-US')).default,
          (await import('@univerjs/preset-sheets-filter/locales/en-US')).default,
          (await import('@univerjs/preset-sheets-sort/locales/en-US')).default,
        ),
      };
    default:
      return {};
  }
}

// Main component for rendering the spreadsheet view
export function SpreadsheetView(props: NodeViewProps) {
  const { ydoc: contextYDoc, provider: contextProvider } = useCollaboration();
  const { t, i18n } = useTranslation();
  const { editor, node } = props;
  const { colorScheme } = useMantineColorScheme();
  const isEditable = editor.isEditable;
  const sheetId = typeof node.attrs.sheetId === "string" ? node.attrs.sheetId : "default";

  const containerRef = useRef<HTMLDivElement>(null);
  const univerAPIRef = useRef<any>(null);
  const cellsYMapRef = useRef<Y.Map<any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Helper to get Y.Doc and provider, with retries for async loading
  const getYDocAndProvider = useCallback(async (): Promise<{ ydoc: Y.Doc | null; provider: any | null }> => {
    try {
      if (contextYDoc) {
        return { ydoc: contextYDoc, provider: contextProvider };
      }

      if (!editor.isEditable) {
        const standaloneYDoc = new Y.Doc();
        return { ydoc: standaloneYDoc, provider: null };
      }

      const getCollabState = () => {
        const syncState = ySyncPluginKey.getState(editor.view.state);
        const ydoc = syncState?.doc as Y.Doc | undefined;
        const provider = syncState?.provider ?? syncState?.binding?.provider ?? null;
        return { ydoc, provider };
      };

      let retries = 0;
      const maxRetries = 100;

      while (retries < maxRetries) {
        const { ydoc, provider } = getCollabState();

        if (ydoc) {
          return { ydoc, provider };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      return { ydoc: null, provider: null };
    } catch (err) {
      console.error("Failed to get Y.Doc/Provider:", err);
      return { ydoc: null, provider: null };
    }
  }, [editor.view.state, editor.isEditable, contextYDoc, contextProvider]);

  // Helper to get Y.Doc without provider for Univer initialization
  const getYDoc = useCallback(async (): Promise<Y.Doc | null> => {
    const { ydoc } = await getYDocAndProvider();
    return ydoc;
  }, [getYDocAndProvider]);

  // Initialize Univer and set up Y.Doc syncing
  const initUniver = useCallback(async () => {
    const { ydoc, provider } = await getYDocAndProvider();

    if (!ydoc) {
      setError("No Y.Doc available");
      setLoading(false);
      return;
    }

    if (!containerRef.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!containerRef.current) {
        setError("Container element not found");
        setLoading(false);
        return;
      }
    }

    try {
      const cellsYMap = getCellsYMap(ydoc, sheetId);
      cellsYMapRef.current = cellsYMap;

      const loadedCellData: Record<string, Record<string, any>> = {};
      cellsYMap.forEach((value, key) => {
        const [row, col] = key.split(",");
        if (!loadedCellData[row]) loadedCellData[row] = {};
        loadedCellData[row][col] = value;
      });

      const containerId = `univer-${sheetId}`;
      containerRef.current.id = containerId;

      const univerLocale = i18n.language.startsWith("zh") ? LocaleType.ZH_CN : LocaleType.EN_US;
      const locales = await loadLocales(univerLocale);
      const { univerAPI } = createUniver({
        locale: univerLocale,
        locales: locales,
        presets: [
          UniverSheetsCorePreset({
            container: containerId,
            formulaBar: true,
            footer: {
              sheetBar: true,
              statisticBar: true,
            },
          }),
          UniverSheetsFilterPreset(),
          UniverSheetsSortPreset(),
        ],
      });

      univerAPI.createWorkbook({
        id: `workbook-${sheetId}`,
        name: 'Spreadsheet',
        sheetOrder: ['sheet1'],
        sheets: {
          sheet1: {
            id: 'sheet1',
            name: t('Sheet1'),
            rowCount: 100,
            columnCount: 20,
            cellData: loadedCellData,
          },
        },
      });
      univerAPIRef.current = univerAPI;
      setLoading(false);

      const handleRemoteSync = (event: Y.YMapEvent<any>) => {
        if (!univerAPIRef.current) return;

        const workbook = univerAPIRef.current.getActiveWorkbook();
        const sheet = workbook?.getActiveSheet();
        if (!sheet) return;

        event.keysChanged.forEach((key: string) => {
          const [rowStr, colStr] = key.split(",");
          const row = parseInt(rowStr, 10);
          const col = parseInt(colStr, 10);
          if (isNaN(row) || isNaN(col)) return;

          const yValue = cellsYMapRef.current?.get(key);

          try {
            const range = sheet.getRange(row, col);

            if (yValue && yValue.f) {
              range.setFormula(yValue.f);
            }
            else if (yValue && yValue.v !== undefined && yValue.v !== null && yValue.v !== '') {
              range.setValue(String(yValue.v));
            }
            else {
              range.setValue('');
            }
          } catch (err) {
            console.error(`Failed to sync cell ${key}:`, err);
            try {
              sheet.getRange(row, col).setValue('');
            } catch (e) {
            }
          }
        });
      };
      cellsYMap.observe(handleRemoteSync);
      (univerAPIRef.current as any).__handleRemoteSync = handleRemoteSync;

      const subscriptions = [];
      if (univerAPI.onCommandExecuted) {
        let isUpdatingFromLocal = false;

        const cmdSub = univerAPI.onCommandExecuted((command: any) => {
          if (command.id !== 'sheet.mutation.set-range-values') return;

          if (isUpdatingFromLocal) return;

          const params = command.params;
          if (!params) return;

          // ========== 处理 cellValue 格式 ==========
          if (params.cellValue) {
            const updates: Array<{ row: number; col: number; value: any; formula: any }> = [];

            if (Array.isArray(params.cellValue)) {
              const workbook = univerAPIRef.current?.getActiveWorkbook();
              const sheet = workbook?.getActiveSheet();
              const selections = sheet?.getSelections();

              if (selections && selections.length > 0) {
                const { startColumn, endColumn } = selections[0];

                for (const rowStr of params.cellValue) {
                  const row = parseInt(rowStr, 10);
                  if (isNaN(row)) continue;

                  // 清空该行所有选中的列
                  for (let col = startColumn; col <= endColumn; col++) {
                    updates.push({
                      row,
                      col,
                      value: '',
                      formula: null
                    });
                  }
                }
              }
            }
            // 情况2：cellValue 是对象（单个单元格或批量更新）
            else if (typeof params.cellValue === 'object') {
              for (const rowStr of Object.keys(params.cellValue)) {
                const row = parseInt(rowStr, 10);
                if (isNaN(row)) continue;

                const rowData = params.cellValue[rowStr];
                for (const colStr of Object.keys(rowData)) {
                  const col = parseInt(colStr, 10);
                  if (isNaN(col)) continue;

                  const cellData = rowData[colStr];
                  updates.push({
                    row,
                    col,
                    value: cellData?.v,
                    formula: cellData?.f
                  });
                }
              }
            }

            if (updates.length === 0) return;

            isUpdatingFromLocal = true;
            try {
              ydoc.transact(() => {
                for (const { row, col, value, formula } of updates) {
                  const key = `${row},${col}`;
                  const existing = cellsYMap.get(key) || {};
                  const newValueStr = value === undefined || value === null ? '' : String(value);

                  // 公式计算结果过滤
                  const hasFormulaInCommand = !!formula;
                  const hasFormulaInYMap = !!existing.f;
                  if (!hasFormulaInCommand && hasFormulaInYMap) continue;

                  cellsYMap.set(key, {
                    ...existing,
                    v: newValueStr,
                    f: formula || null,
                    s: null
                  });
                }
              }, "univer-edit");
            } finally {
              setTimeout(() => {
                isUpdatingFromLocal = false;
              }, 100);
            }
          }
        });
        subscriptions.push(cmdSub);
      }
      if (univerAPI.addEvent) {
        const sheetEditEndedSub = univerAPI.addEvent('SheetEditEnded' as any, (event: any) => {
          const row = event.row;
          const col = event.column;
          const formula = event.formula;

          if (row !== undefined && col !== undefined && formula) {
            ydoc.transact(() => {
              const existing = cellsYMap.get(`${row},${col}`) || {};
              cellsYMap.set(`${row},${col}`, {
                ...existing,
                f: formula,
                s: null
              });
            }, "univer-edit");
          }
        });
        subscriptions.push(sheetEditEndedSub);
      }
    } catch (err) {
      console.error("Univer init error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, [getYDocAndProvider, sheetId, i18n.language, t]);

  // Initialize Univer on mount and when sheetId changes
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (initializedRef.current) return;

      const ydoc = await getYDoc();
      if (!ydoc) {
        if (isMounted) {
          setError("Unable to connect to collaboration server");
          setLoading(false);
        }
        return;
      }

      initializedRef.current = true;
      await initUniver();
    };

    init();

    return () => {
      isMounted = false;
      if (univerAPIRef.current) {
        if (cellsYMapRef.current && (univerAPIRef.current as any).__handleRemoteSync) {
          cellsYMapRef.current.unobserve((univerAPIRef.current as any).__handleRemoteSync);
        }
        if ((univerAPIRef.current as any).__cleanup) {
          (univerAPIRef.current as any).__cleanup();
        }
        if ((univerAPIRef.current as any).dispose) {
          (univerAPIRef.current as any).dispose();
        }
        univerAPIRef.current = null;
      }
      cellsYMapRef.current = null;
      initializedRef.current = false;
    };
  }, [getYDoc, initUniver]);

  // Update sheet editability when editor becomes editable/non-editable
  useEffect(() => {
    if (!univerAPIRef.current) return;

    const activeWorkbook = univerAPIRef.current.getActiveWorkbook();
    const activeSheet = activeWorkbook?.getActiveSheet();

    if (activeSheet && activeSheet.setEditable) {
      activeSheet.setEditable(isEditable);
    }
  }, [isEditable]);

  // Re-initialize Univer when language changes to load new locale
  useEffect(() => {
    const handleLanguageChange = () => {
      if (univerAPIRef.current) {
        if (cellsYMapRef.current && (univerAPIRef.current as any).__handleRemoteSync) {
          cellsYMapRef.current.unobserve((univerAPIRef.current as any).__handleRemoteSync);
        }
        if ((univerAPIRef.current as any).dispose) {
          (univerAPIRef.current as any).dispose();
        }
        univerAPIRef.current = null;
      }
      initializedRef.current = false;

      const init = async () => {
        const ydoc = await getYDoc();
        if (ydoc) initUniver();
      };
      init();
    };

    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n, getYDoc, initUniver]);

  const background = colorScheme === "dark" ? "#1A1B1E" : "#FFFFFF";

  return (
    <NodeViewWrapper data-drag-handle>
      <Paper
        shadow="sm"
        radius="md"
        p="md"
        style={{
          background,
          display: "flex",
          flexDirection: "column",
          height: "40vh",
          minHeight: 280,
          maxHeight: "60vh",
          overflow: "hidden",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          position: "relative",
        }}
      >
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />

        {loading && (
          <Box style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.7)',
            zIndex: 10
          }}>
            <Loader />
          </Box>
        )}

        {error && !loading && (
          <Text c="red" style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)"
          }}>
            {t('Failed to load spreadsheet')}: {error}
          </Text>
        )}
      </Paper>
    </NodeViewWrapper>
  );
}