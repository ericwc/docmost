STEP 1 OF 5 - Implement Workbook Snapshot Sync for Univer Spreadsheet

GOAL: Replace current cell-level Y.Map sync with workbook snapshot sync that captures entire workbook state including row height, column width, merged cells, and all formatting.

CONTEXT: Docmost collaborative wiki using TipTap editor, Univer spreadsheet, Yjs for collaboration.

DO NOT generate React component or Node extension. Generate ONLY the snapshot sync logic to replace existing cell sync code.

FUNCTIONAL REQUIREMENTS:
- Save entire workbook snapshot (IWorkbookData) when user makes any change
- Broadcast snapshot to other collaborators via Yjs
- Load snapshot when initializing spreadsheet
- Handle remote snapshot updates
- Preserve all worksheet properties including row heights, column widths, merged cells

TECHNICAL REQUIREMENTS:

1. Get ResourceLoaderService after Univer initialization:
   - Access underlying Univer instance from univerAPI
   - Get service: resourceLoaderService = univerInstance.getService(ResourceLoaderService)
   - Alternative: univerAPI._injector.get(ResourceLoaderService)

2. Save workbook snapshot function:
   - Use resourceLoaderService.saveWorkbook() to get IWorkbookData
   - JSON.stringify the snapshot
   - Optionally compress using pako library
   - Store in Y.Map at path 'spreadsheet_snapshot' with key 'data'
   - Use ydoc.transact() to update

3. Debouncing (performance optimization):
   - Save only after user stops editing for 500ms
   - Use setTimeout with clear on each new change
   - Prevents excessive saves during rapid editing

4. Compression (performance optimization):
   - Use pako.deflate() before storing to Y.Map
   - Reduces network transfer size by 70-80%
   - Decompress on load with pako.inflate()

5. Load snapshot on initialization:
   - Check if snapshot exists in Y.Map
   - If exists, parse and use as workbook data
   - If not, use default empty workbook structure

6. Remote sync handling:
   - Observe Y.Map changes on 'spreadsheet_snapshot' path
   - Use flag (isApplyingRemoteSnapshot) to prevent loops
   - Load snapshot into Univer using loadSnapshot or recreate workbook

7. Change detection (performance optimization):
   - Compare snapshot hash before saving
   - Only update Y.Map if content changed

8. Lazy loading (performance optimization):
   - Don't initialize Univer until spreadsheet is visible
   - Use IntersectionObserver

CONFLICT RESOLUTION:
- Last Write Wins (LWW) for snapshot conflicts
- Yjs CRDT handles concurrent updates automatically
- Use origin tracking in ydoc.transact() to avoid loops

ERROR HANDLING:
- Wrap snapshot operations in try-catch
- Fallback to empty workbook if snapshot corrupted
- Log errors but don't break editor

MEMORY MANAGEMENT:
- Clean up observers on component unmount
- Dispose Univer instance properly
- Clear debounce timeout on unmount

EXPECTED BENEFITS:
- Row height/column width: Now synced
- Merged cells: Now synced
- Hidden rows/columns: Now synced
- Complete cell formatting: Now synced
- Single source of truth: Full workbook state

STOP after providing the implementation code. Do not generate anything else.