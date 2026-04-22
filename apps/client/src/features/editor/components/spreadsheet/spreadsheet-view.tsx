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

import pako from 'pako';


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

  // const lastProcessedVersionRef = useRef<number>(0);
  const isSavingRef = useRef(false);

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

    console.log('Initializing Univer for sheetId:', sheetId);
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

      // Check if snapshot exists in Y.Map
      const snapshotYMap = ydoc.getMap('spreadsheet_snapshot');
      const savedSnapshot = snapshotYMap.get('data');

      let workbookData;
      if (savedSnapshot && typeof savedSnapshot === 'string') {
        const decompressed = pako.inflate(Uint8Array.from(atob(savedSnapshot), c => c.charCodeAt(0)));
        workbookData = JSON.parse(new TextDecoder().decode(decompressed));
      } else {
        workbookData = {
          id: `workbook-${sheetId}`,
          name: 'Spreadsheet',
          sheetOrder: ['sheet1'],
          sheets: {
            sheet1: {
              id: 'sheet1',
              name: t('Sheet1'),
              columnCount: 26,
              cellData: {},
            },
          },
        };
      }
      univerAPI.createWorkbook(workbookData);
      univerAPIRef.current = univerAPI;
      setLoading(false);

      // const handleRemoteSync = (event: Y.YMapEvent<any>) => {
      //   if (event.transaction.origin === ydoc.clientID.toString()) return;

      //   if (!univerAPIRef.current) return;

      //   const snapshotYMap = ydoc.getMap('spreadsheet_snapshot');
      //   const remoteSnapshot = snapshotYMap.get('data');
      //   if (!remoteSnapshot || typeof remoteSnapshot !== 'string') return;

      //   const version = snapshotYMap.get('version') as number || 0;
      //   if (version <= lastProcessedVersionRef.current) return;

      //   console.log('Applying remote snapshot, version:', version);

      //   lastProcessedVersionRef.current = version;

      //   try {
      //     const decompressed = pako.inflate(Uint8Array.from(atob(remoteSnapshot), c => c.charCodeAt(0)));
      //     const remoteWorkbookData = JSON.parse(new TextDecoder().decode(decompressed));
      //     const sheetId = remoteWorkbookData.sheetOrder?.[0] || 'sheet1';
      //     const cellData = remoteWorkbookData.sheets[sheetId].cellData;

      //     const workbook = univerAPIRef.current.getActiveWorkbook();
      //     const sheet = workbook?.getActiveSheet();
      //     if (!sheet) return;

      //     if (cellData) {
      //       for (const rowStr in cellData) {
      //         const row = parseInt(rowStr, 10);
      //         for (const colStr in cellData[rowStr]) {
      //           const col = parseInt(colStr, 10);
      //           const data = cellData[rowStr][colStr];
      //           const range = sheet.getRange(row, col);

      //           if (data.f) {
      //             range.setFormula(data.f);
      //           } else if (data.v !== undefined && data.v !== null && data.v !== '') {
      //             range.setValue(String(data.v));
      //           } else {
      //             range.setValue('');
      //           }
      //           if (data.s) {
      //             try {
      //               if (typeof range.setStyle === 'function') {
      //                 range.setStyle(data.s);
      //               }
      //             } catch (styleErr) {
      //             }
      //           }
      //         }
      //       }
      //     }
      //   } catch (err) {
      //     console.error('Failed to apply remote snapshot:', err);
      //   }
      // };
      // snapshotYMap.observe(handleRemoteSync);

      let saveTimeout: NodeJS.Timeout | null = null;

      const saveWorkbookSnapshot = async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;

        try {
          if (!univerAPIRef.current) return;

          // Get current workbook snapshot
          const fWorkbook = univerAPI.getActiveWorkbook();
          const snapshot = fWorkbook.save();

          let snapshotStr = JSON.stringify(snapshot);
          const compressed = pako.deflate(snapshotStr);
          snapshotStr = btoa(String.fromCharCode.apply(null, compressed));

          // Update Y.Map with snapshot
          const snapshotYMap = ydoc.getMap('spreadsheet_snapshot');
          const currentVersion = (snapshotYMap.get('version') as number) || 0;
          const newVersion = currentVersion + 1;

          ydoc.transact(() => {
            snapshotYMap.set('data', snapshotStr);
            snapshotYMap.set('version', newVersion);
          }, ydoc.clientID.toString());
        } catch (err) {
          console.error('Failed to save snapshot:', err);
        } finally {
          isSavingRef.current = false;
        }
      };

      // Debounced version (save after user stops editing)
      const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveWorkbookSnapshot, 500);
      };

      const subscriptions = [];
      if (univerAPI.addEvent) {
        const valueChangedSub = univerAPI.addEvent('SheetValueChanged' as any, async (event: any) => {
          debouncedSave();
        });

        subscriptions.push(valueChangedSub);
      }
    } catch (err) {
      console.error("Univer init error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, [getYDocAndProvider, sheetId, i18n.language, t]);

  // Initialize Univer on mount and when sheetId changes
  useEffect(() => {
    if (initializedRef.current) return;

    let isMounted = true;
    const init = async () => {
      const ydoc = await getYDoc();
      if (!ydoc) {
        if (isMounted) {
          setError("Unable to connect to collaboration server");
          setLoading(false);
        }
        return;
      }
      await initUniver();
      initializedRef.current = true;
    };

    init();

    return () => {
      isMounted = false;

      if (univerAPIRef.current) {
        if (cellsYMapRef.current && (univerAPIRef.current as any).__handleRemoteSync) {
          try {
            cellsYMapRef.current.unobserve((univerAPIRef.current as any).__handleRemoteSync);
          } catch (err) {
            console.warn('Failed to unobserve remote sync:', err);
          }
        }

        if ((univerAPIRef.current as any).__subscriptions) {
          for (const sub of (univerAPIRef.current as any).__subscriptions) {
            try {
              if (sub && typeof sub.dispose === 'function') {
                sub.dispose();
              }
            } catch (err) {
              console.warn('Failed to dispose subscription:', err);
            }
          }
        }

        if (cellsYMapRef.current && (univerAPIRef.current as any).__ydocUpdateHandler) {
          try {
            cellsYMapRef.current.unobserve((univerAPIRef.current as any).__ydocUpdateHandler);
          } catch (err) {
            console.warn('Failed to unobserve ydoc update:', err);
          }
        }

        if ((univerAPIRef.current as any).dispose) {
          try {
            (univerAPIRef.current as any).dispose();
          } catch (err) {
            console.warn('Failed to dispose Univer:', err);
          }
        }

        univerAPIRef.current = null;
      }

      cellsYMapRef.current = null;
      initializedRef.current = false;
    };
  }, []);

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
          height: "calc(100vh - 120px)",
          minHeight: 1000,
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