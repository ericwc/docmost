import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface SpreadsheetOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface SpreadsheetAttributes {
  sheetId: string;
  rowCount: number;
  colCount: number;
  showToolbar: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spreadsheet: {
      insertSpreadsheet: (attributes?: Partial<SpreadsheetAttributes>) => ReturnType;
    };
  }
}

const defaultSheetId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "";

export const Spreadsheet = Node.create<SpreadsheetOptions>({
  name: "spreadsheet",
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      sheetId: {
        default: defaultSheetId,
        parseHTML: (element) => element.getAttribute("data-sheet-id") ?? defaultSheetId,
        renderHTML: (attributes) => ({
          "data-sheet-id": attributes.sheetId,
        }),
      },
      rowCount: {
        default: 100,
        parseHTML: (element) => Number(element.getAttribute("data-row-count") ?? 100),
        renderHTML: (attributes) => ({
          "data-row-count": attributes.rowCount,
        }),
      },
      colCount: {
        default: 20,
        parseHTML: (element) => Number(element.getAttribute("data-col-count") ?? 20),
        renderHTML: (attributes) => ({
          "data-col-count": attributes.colCount,
        }),
      },
      showToolbar: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-show-toolbar") !== "false",
        renderHTML: (attributes) => ({
          "data-show-toolbar": attributes.showToolbar ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": this.name, ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      insertSpreadsheet:
        (attributes) =>
          ({ commands }) => {
            return commands.insertContent({
              type: this.name,
              attrs: attributes,
            });
          },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-S": () => this.editor.chain().focus().insertSpreadsheet().run(),
    };
  },
});