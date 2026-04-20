import { createContext, useContext } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

interface CollaborationContextValue {
  ydoc: Y.Doc | null;
  provider: HocuspocusProvider | null;
}

const CollaborationContext = createContext<CollaborationContextValue>({
  ydoc: null,
  provider: null,
});

export const useCollaboration = () => useContext(CollaborationContext);
export const CollaborationProvider = CollaborationContext.Provider;