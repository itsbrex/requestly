import React, { useCallback, useState } from "react";
import { RQAPI } from "features/apiClient/types";
import { Input } from "antd";
import { getUserAuthDetails } from "store/slices/global/user/selectors";
import { useDispatch, useSelector } from "react-redux";
import { useApiClientContext } from "features/apiClient/contexts";
import { toast } from "utils/Toast";
import { LoadingOutlined } from "@ant-design/icons";
import { getEmptyAPIEntry } from "features/apiClient/screens/apiClient/utils";
import "./newRecordNameInput.scss";
import {
  trackCollectionSaved,
  trackCollectionRenamed,
  trackRequestSaved,
  trackRequestRenamed,
} from "modules/analytics/events/features/apiClient";
import { useTabsLayoutContext } from "layouts/TabsLayout";
import PATHS from "config/constants/sub/paths";
import { variablesActions } from "store/features/variables/slice";

export interface NewRecordNameInputProps {
  recordToBeEdited?: RQAPI.Record;
  newRecordCollectionId?: string;
  recordType: RQAPI.RecordType;
  onSuccess: () => void;
  analyticEventSource: RQAPI.AnalyticsEventSource;
}

export const NewRecordNameInput: React.FC<NewRecordNameInputProps> = ({
  recordToBeEdited,
  recordType,
  onSuccess,
  newRecordCollectionId,
  analyticEventSource = "",
}) => {
  const dispatch = useDispatch();
  const user = useSelector(getUserAuthDetails);
  const uid = user?.details?.profile?.uid;
  const { onSaveRecord, apiClientRecordsRepository, forceRefreshApiClientRecords } = useApiClientContext();
  const { replaceTab, updateTab, closeTab } = useTabsLayoutContext();

  const defaultRecordName = recordType === RQAPI.RecordType.API ? "Untitled request" : "New collection";
  const [recordName, setRecordName] = useState(recordToBeEdited?.name || defaultRecordName);
  const [isLoading, setIsLoading] = useState(false);
  const isEditMode = !!recordToBeEdited;

  // TODO: Refactor and merge save and update handler
  const saveNewRecord = useCallback(async () => {
    setIsLoading(true);

    if (!uid || !recordName) {
      setIsLoading(false);
      onSuccess?.();
      return;
    }

    const record: Partial<RQAPI.Record> = {
      name: recordName || defaultRecordName,
    };

    if (recordType === RQAPI.RecordType.API) {
      record.type = RQAPI.RecordType.API;
      record.data = getEmptyAPIEntry();
    } else {
      record.type = RQAPI.RecordType.COLLECTION;

      // @ts-ignore TODO: Fix type
      record.data = {};
    }

    if (newRecordCollectionId) {
      record.collectionId = newRecordCollectionId;
    }

    const result =
      record.type === RQAPI.RecordType.API
        ? await apiClientRecordsRepository.createRecord(record)
        : await apiClientRecordsRepository.createCollection(record);

    if (result.success) {
      onSaveRecord(result.data);
      if (recordType === RQAPI.RecordType.API) {
        trackRequestSaved({
          src: analyticEventSource,
          has_scripts: Boolean(record?.data?.scripts?.preRequest?.length),
          auth_type: record?.data?.auth?.currentAuthType,
        });

        replaceTab("request/new", {
          id: result.data.id,
          title: result.data.name,
          url: `${PATHS.API_CLIENT.ABSOLUTE}/request/${encodeURIComponent(result.data.id)}`,
        });
      } else {
        trackCollectionSaved(analyticEventSource);
        dispatch(variablesActions.updateCollectionVariables({ collectionId: result.data.id, variables: {} }));
        replaceTab("collection/new", {
          id: result.data.id,
          title: result.data.name,
          url: `${PATHS.API_CLIENT.ABSOLUTE}/collection/${encodeURIComponent(result.data.id)}`,
        });
      }

      const toastSuccessMessage = recordType === RQAPI.RecordType.API ? "Request created!" : "Collection Created!";
      toast.success(toastSuccessMessage);
    } else {
      toast.error(
        result?.message || `Could not save ${record.type === RQAPI.RecordType.COLLECTION ? "Collection" : "Request"}.`
      );
    }

    setIsLoading(false);
    onSuccess?.();
  }, [
    uid,
    recordName,
    defaultRecordName,
    recordType,
    newRecordCollectionId,
    apiClientRecordsRepository,
    onSuccess,
    onSaveRecord,
    analyticEventSource,
    replaceTab,
    dispatch,
  ]);

  const updateRecord = useCallback(async () => {
    setIsLoading(true);

    if (!uid) {
      return;
    }

    if (!recordName || recordName === recordToBeEdited.name) {
      setIsLoading(false);
      onSuccess?.();
      return;
    }

    const record: Partial<RQAPI.Record> = {
      ...recordToBeEdited,
      name: recordName,
    };

    const result =
      record.type === RQAPI.RecordType.API
        ? await apiClientRecordsRepository.updateRecord(record, record.id)
        : await apiClientRecordsRepository.renameCollection(record.id, record.name);

    // const updatedRecords = await repository.reactToRename(records);
    // if(updatedRecords) {
    // 	setState(updatedRecords);
    // }
    //
    // await forceRefreshApilClientRecords(){
    // repo.getAllRecords()
    // setApiClientRecords()
    // }

    if (result.success) {
      // False is passed to not open the tab when renaming the record from sidebar
      onSaveRecord(result.data);

      const wasForceRefreshed = await forceRefreshApiClientRecords();
      if (wasForceRefreshed && recordType === RQAPI.RecordType.COLLECTION) {
        closeTab(record.id);
      }

      if (recordType === RQAPI.RecordType.API) {
        trackRequestRenamed("api_client_sidebar");
      } else {
        trackCollectionRenamed();
      }

      updateTab(record.id, { title: result.data.name });

      const toastSuccessMessage = recordType === RQAPI.RecordType.API ? "Request updated!" : "Collection updated!";
      toast.success(toastSuccessMessage);
    } else {
      toast.error(result?.message || "Something went wrong!");
    }

    setIsLoading(false);
    onSuccess?.();
  }, [
    recordType,
    recordToBeEdited,
    recordName,
    uid,
    onSaveRecord,
    onSuccess,
    updateTab,
    apiClientRecordsRepository,
    forceRefreshApiClientRecords,
    closeTab,
  ]);

  const onBlur = isEditMode ? updateRecord : saveNewRecord;

  return (
    <div className="new-record-input-container">
      {isLoading ? (
        <div className="new-record-input-placeholder">
          <div className="record-name">{recordName || defaultRecordName}</div>
          <LoadingOutlined />
        </div>
      ) : (
        <Input
          autoFocus
          value={recordName}
          onBlur={onBlur}
          onPressEnter={onBlur}
          className="new-record-input"
          status={recordName.length === 0 ? "error" : ""}
          onChange={(e) => {
            setRecordName(e.target.value);
          }}
        />
      )}
    </div>
  );
};
