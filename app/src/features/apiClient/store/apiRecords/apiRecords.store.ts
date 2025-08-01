import { NativeError } from "errors/NativeError";
import { ErroredRecord } from "features/apiClient/helpers/modules/sync/local/services/types";
import { RQAPI } from "features/apiClient/types";
import { create, StoreApi } from "zustand";

export type RecordState = {
  version: number;
  record: RQAPI.Record;
  updateRecordState: (patch: RQAPI.Record) => void;
  incrementVersion: () => void;
};

export type ApiRecordsState = {
  /**
   * This is the list of records that are currently in the apiClientRecords.
   */
  apiClientRecords: RQAPI.Record[];

  /**
   * This is the list of records that have errors.
   */
  erroredRecords: ErroredRecord[];

  /**
   * This maintains a map of child <-> parent. This field is mostly for internal use,
   * since it will get updated when any relationship changes. So try not to use this
   * unless you want to listen to all changes.
   */
  childParentMap: Map<string, string>;

  /**
   * This is a helper map, which provides actual data for a given id. Again, not for external use
   * unless neccessary.
   */
  index: Map<string, RQAPI.Record>;

  /**
   * This maintains a version for each entity. This version is kept in a zunstand store so that
   * one can use it as a hook and react whenever it changes.
   */
  indexStore: Map<string, StoreApi<RecordState>>;

  getParentChain: (id: string) => string[];

  /**
   * It updates the version of children of given entity. Meaning any component relying on version
   * will get re-rendered.
   */
  triggerUpdateForChildren: (id: string) => void;

  /**
   * This is called to update/sync the internal data with external changes happening in apiClientRecords.
   */
  refresh: (records: RQAPI.Record[]) => void;
  setErroredRecords: (erroredRecords: ErroredRecord[]) => void;
  getData: (id: string) => RQAPI.Record | undefined;
  getParent: (id: string) => string | undefined;
  getRecordStore: (id: string) => StoreApi<RecordState> | undefined;
  getAllRecords: () => RQAPI.Record[];

  addNewRecord: (record: RQAPI.Record) => void;
  addNewRecords: (records: RQAPI.Record[]) => void;
  updateRecord: (record: RQAPI.Record) => void;
  updateRecords: (records: RQAPI.Record[]) => void;
  deleteRecords: (recordIds: string[]) => void;
};

function getAllChildren(initalId: string, childParentMap: Map<string, string>) {
  const result: string[] = [];
  const getImmediateChildren = (id: string) =>
    Array.from(childParentMap.entries())
      .filter(([_, v]) => v === id)
      .map(([k, _]) => k);
  const parseRecursively = (id: string) => {
    const children = getImmediateChildren(id);
    result.push(...children);
    children.forEach(parseRecursively);
  };
  parseRecursively(initalId);
  return result;
}

function parseRecords(records: RQAPI.Record[]) {
  const childParentMap = new Map<string, string>();
  const index = new Map<string, RQAPI.Record>();

  for (const record of records) {
    if (record.collectionId) {
      childParentMap.set(record.id, record.collectionId);
    }
    index.set(record.id, record);
  }

  return {
    childParentMap,
    index,
  };
}

export function createRecordStore(record: RQAPI.Record) {
  return create<RecordState>()((set, get) => ({
    version: 0,
    record,
    updateRecordState: (patch: Partial<RQAPI.Record>) => {
      const record = get().record;
      const updatedRecord = { ...record, ...patch } as RQAPI.Record;
      set({
        record: updatedRecord,
        version: get().version + 1,
      });
    },

    incrementVersion: () => {
      set({
        version: get().version + 1,
      });
    },
  }));
}

function createIndexStore(index: ApiRecordsState["index"]) {
  const indexStore = new Map<string, StoreApi<RecordState>>();
  for (const [id] of index) {
    indexStore.set(id, createRecordStore(index.get(id) as RQAPI.Record));
  }

  return indexStore;
}

export const createApiRecordsStore = (initialRecords: { records: RQAPI.Record[]; erroredRecords: ErroredRecord[] }) => {
  const { childParentMap: initialChildParentMap, index: initialIndex } = parseRecords(initialRecords.records);
  return create<ApiRecordsState>()((set, get) => ({
    apiClientRecords: initialRecords.records,
    erroredRecords: initialRecords.erroredRecords,

    childParentMap: initialChildParentMap,
    index: initialIndex,

    indexStore: createIndexStore(initialIndex),

    refresh(records) {
      const { indexStore } = get();
      const { childParentMap, index } = parseRecords(records);

      for (const [id] of index) {
        if (!indexStore.has(id)) {
          indexStore.set(id, createRecordStore(index.get(id) as RQAPI.Record));
        }
      }

      for (const [id] of indexStore) {
        if (!index.has(id)) {
          indexStore.delete(id);
        }
      }

      set({
        apiClientRecords: records,
        childParentMap,
        index,
        indexStore,
      });
    },

    setErroredRecords(erroredRecords) {
      set({
        erroredRecords,
      });
    },

    getData(id) {
      const { index } = get();
      return index.get(id);
    },

    getParent(id) {
      const { childParentMap } = get();
      return childParentMap.get(id);
    },

    getParentChain(id) {
      const { getParent } = get();
      const result: string[] = [];
      const parseRecursively = (id: string) => {
        const parent = getParent(id);
        if (!parent) {
          return;
        }
        result.push(parent);
        parseRecursively(parent);
      };
      parseRecursively(id);
      return result;
    },

    triggerUpdateForChildren(id) {
      const { childParentMap, indexStore } = get();
      const allChildren = getAllChildren(id, childParentMap);

      allChildren.forEach((cid) => {
        const recordStore = indexStore.get(cid);

        if (!recordStore) {
          new NativeError("Record store does not exist!").addContext({ id: cid });
        }

        recordStore!.getState().incrementVersion();
      });
    },

    addNewRecord(record) {
      const updatedRecords = [...get().apiClientRecords, record];
      get().refresh(updatedRecords);
    },

    addNewRecords(records) {
      const updatedRecords = [...get().apiClientRecords, ...records];
      get().refresh(updatedRecords);
    },

    updateRecord(patch) {
      const updatedRecords = get().apiClientRecords.map((r) => (r.id === patch.id ? { ...r, ...patch } : r));
      get().refresh(updatedRecords);

      const recordStore = get().getRecordStore(patch.id);

      if (!recordStore) {
        new NativeError("Record store does not exist!").addContext({ id: patch.id });
      }

      recordStore!.getState().updateRecordState(patch);
      get().triggerUpdateForChildren(patch.id);
    },

    updateRecords(patches) {
      const patchMap = new Map(patches.map((r) => [r.id, r]));
      const updatedRecords = get().apiClientRecords.map((r) =>
        patchMap.has(r.id) ? { ...r, ...patchMap.get(r.id) } : r
      );
      get().refresh(updatedRecords);

      const updatedRecordMap = new Map(updatedRecords.map((r) => [r.id, r]));
      for (const patch of patches) {
        const updatedRecord = updatedRecordMap.get(patch.id);
        if (updatedRecord) {
          const recordStore = get().getRecordStore(patch.id);

          if (!recordStore) {
            new NativeError("Record store does not exist!").addContext({ id: patch.id });
          }

          recordStore!.getState().updateRecordState(updatedRecord);
          get().triggerUpdateForChildren(patch.id);
        }
      }
    },

    deleteRecords(recordIds) {
      const updatedRecords = get().apiClientRecords.filter((r) => !recordIds.includes(r.id));
      get().refresh(updatedRecords);
    },

    getRecordStore(id) {
      const { indexStore } = get();
      const recordStore = indexStore.get(id);
      return recordStore;
    },

    getAllRecords() {
      return get().apiClientRecords;
    },
  }));
};
