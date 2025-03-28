import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import { getAppMode } from "store/selectors";
import { getUserAuthDetails } from "store/slices/global/user/selectors";
import { switchWorkspace } from "actions/TeamWorkspaceActions";
import { httpsCallable, getFunctions } from "firebase/functions";
import { Typography, Switch, Divider, Row } from "antd";
import { RQButton, RQInput } from "lib/design-system/components";
import CopyButton from "components/misc/CopyButton";
import MemberRoleDropdown from "features/settings/components/Profile/ManageTeams/TeamViewer/common/MemberRoleDropdown";
import { toast } from "utils/Toast";
import { getDomainFromEmail } from "utils/FormattingHelper";
import { renameWorkspace } from "backend/workspace";
import { trackWorkspaceInviteLinkCopied, trackCreateNewTeamClicked } from "modules/analytics/events/common/teams";
import {
  trackOnboardingWorkspaceSkip,
  trackWorkspaceOnboardingPageViewed,
} from "modules/analytics/events/misc/onboarding";
import {
  trackAddTeamMemberFailure,
  trackAddTeamMemberSuccess,
  trackNewTeamCreateSuccess,
} from "modules/analytics/events/features/teams";
import { globalActions } from "store/slices/global/slice";
import { NewTeamData, OnboardingSteps } from "../../types";
import EmailInputWithDomainBasedSuggestions from "components/common/EmailInputWithDomainBasedSuggestions";
import { getAvailableBillingTeams } from "store/features/billing/selectors";
import { isWorkspaceMappedToBillingTeam } from "features/settings";
import TEAM_WORKSPACES from "config/constants/sub/team-workspaces";
import { isActiveWorkspaceShared } from "store/slices/workspaces/selectors";

interface Props {
  defaultTeamData: NewTeamData | null;
}
export const CreateWorkspace: React.FC<Props> = ({ defaultTeamData }) => {
  const dispatch = useDispatch();
  const functions = getFunctions();

  const upsertTeamCommonInvite = useMemo(
    () =>
      httpsCallable<{ teamId: string; domainEnabled: boolean }, { succes: true }>(
        functions,
        "invites-upsertTeamCommonInvite"
      ),
    [functions]
  );

  const user = useSelector(getUserAuthDetails);
  const isSharedWorkspaceMode = useSelector(isActiveWorkspaceShared);
  const appMode = useSelector(getAppMode);

  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [makeUserAdmin, setMakeUserAdmin] = useState(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState<string>(defaultTeamData?.name ?? "My new team");
  const [domainJoiningEnabled, setDomainJoiningEnabled] = useState<boolean>(true);
  const billingTeams = useSelector(getAvailableBillingTeams);

  const userEmailDomain = useMemo(() => getDomainFromEmail(user?.details?.profile?.email), [
    user?.details?.profile?.email,
  ]);

  const handleAddMembers = useCallback(
    (newWorkspaceName?: string, newTeamId?: string) => {
      if (!newWorkspaceName) {
        toast.warn("Please enter the workspace name");
        return;
      }

      if (!inviteEmails || !inviteEmails.length) {
        toast.warn("Please add members email to invite them");
        return;
      }
      setIsProcessing(true);

      renameWorkspace(defaultTeamData?.teamId ?? newTeamId, newWorkspaceName);

      const createTeamInvites = httpsCallable(getFunctions(), "invites-createTeamInvites");

      createTeamInvites({
        teamId: defaultTeamData?.teamId ?? newTeamId,
        emails: inviteEmails,
        role: makeUserAdmin ? "admin" : "write",
      })
        .then((res: any) => {
          if (res?.data?.success) {
            toast.success("Invite sent successfully");
            trackAddTeamMemberSuccess({
              team_id: defaultTeamData?.teamId ?? newTeamId,
              email: inviteEmails,
              is_admin: makeUserAdmin,
              source: "onboarding",
              num_users_added: inviteEmails.length,
              workspace_type: isWorkspaceMappedToBillingTeam(defaultTeamData?.teamId ?? newTeamId, billingTeams)
                ? TEAM_WORKSPACES.WORKSPACE_TYPE.MAPPED_TO_BILLING_TEAM
                : TEAM_WORKSPACES.WORKSPACE_TYPE.NOT_MAPPED_TO_BILLING_TEAM,
            });
            dispatch(globalActions.updateWorkspaceOnboardingStep(OnboardingSteps.RECOMMENDATIONS));
          }
          setIsProcessing(false);
          switchWorkspace(
            {
              teamId: defaultTeamData?.teamId ?? newTeamId,
              teamMembersCount: 1,
            },
            dispatch,
            {
              isWorkspaceMode: isSharedWorkspaceMode,
              isSyncEnabled: true,
            },
            appMode,
            null,
            "onboarding"
          );
        })
        .catch((err) => {
          toast.error("Error while sending invitations");
          trackAddTeamMemberFailure(defaultTeamData?.teamId ?? newTeamId, inviteEmails, null, "onboarding");
        });
    },
    [appMode, dispatch, isSharedWorkspaceMode, inviteEmails, defaultTeamData?.teamId, makeUserAdmin]
  );

  const handleCreateNewTeam = useCallback(() => {
    trackCreateNewTeamClicked("onboarding");
    setIsProcessing(true);
    const createTeam = httpsCallable(getFunctions(), "teams-createTeam");
    createTeam({
      teamName: newWorkspaceName,
    }).then((response: any) => {
      if (inviteEmails?.length) {
        handleAddMembers(newWorkspaceName, response?.data?.teamId);
      } else {
        setIsProcessing(false);
        dispatch(globalActions.updateWorkspaceOnboardingStep(OnboardingSteps.RECOMMENDATIONS));
      }
      trackNewTeamCreateSuccess(response?.data?.teamId, newWorkspaceName, "onboarding");
      switchWorkspace(
        {
          teamId: response?.data?.teamId,
          teamName: newWorkspaceName,
          teamMembersCount: response?.data?.accessCount,
        },
        dispatch,
        { isWorkspaceMode: isSharedWorkspaceMode, isSyncEnabled: true },
        appMode,
        null,
        "onboarding"
      );
    });
  }, [appMode, dispatch, isSharedWorkspaceMode, newWorkspaceName, inviteEmails?.length, handleAddMembers]);

  const handleDomainToggle = useCallback(
    (enabled: boolean) => {
      if (defaultTeamData) {
        setDomainJoiningEnabled(enabled);
        upsertTeamCommonInvite({ teamId: defaultTeamData?.teamId, domainEnabled: enabled })
          .then((res: any) => {
            if (!res?.data?.success) {
              setDomainJoiningEnabled(!enabled);
              toast.error("Couldn't update this setting. Please contact support.");
            }
          })
          .catch(() => {
            setDomainJoiningEnabled(!enabled);
            toast.error("Couldn't update this setting. Please contact support.");
          });
      }
    },
    [defaultTeamData, upsertTeamCommonInvite]
  );

  useEffect(() => {
    if (defaultTeamData) {
      upsertTeamCommonInvite({ teamId: defaultTeamData?.teamId, domainEnabled: true });
    }
  }, [defaultTeamData, upsertTeamCommonInvite]);

  useEffect(() => {
    trackWorkspaceOnboardingPageViewed("create_workspace");
  }, []);

  return (
    <>
      <div className="header text-center ">{defaultTeamData ? "Invite teammates" : "Create new workspace"}</div>
      <div className="mt-20">
        <label htmlFor="workspace-name" className="text-bold text-white">
          Name of your workspace
        </label>
        <RQInput
          id="workspace-name"
          size="small"
          placeholder="Workspace name"
          className="mt-8 workspace-onboarding-field"
          value={newWorkspaceName}
          onChange={(e) => setNewWorkspaceName(e.target.value)}
        />
      </div>
      <div className="mt-20">
        <label htmlFor="email-address" className="text-bold text-white">
          Email address
        </label>
        <EmailInputWithDomainBasedSuggestions onChange={setInviteEmails} />
        <Row justify="end" className="mt-8">
          <MemberRoleDropdown
            placement="bottomRight"
            isAdmin={makeUserAdmin}
            handleMemberRoleChange={(isAdmin) => setMakeUserAdmin(isAdmin)}
          />
        </Row>
      </div>
      {defaultTeamData && (
        <div className="mt-20">
          <div className="text-bold text-white">Invite link</div>
          <div className="workspace-invite-link">
            <RQInput
              size="small"
              className="mt-8 workspace-onboarding-field text-white"
              disabled
              value={`${window.location.origin}/invite/${defaultTeamData?.inviteId}`}
            />
            <CopyButton
              size="middle"
              type="default"
              title="Copy"
              copyText={`${window.location.origin}/invite/${defaultTeamData?.inviteId}`}
              trackCopiedEvent={() => trackWorkspaceInviteLinkCopied("onboarding")}
            />
          </div>
        </div>
      )}
      {defaultTeamData && (
        <>
          <Divider />
          <div className="mt-20 space-between">
            <Typography.Text className="text-gray">
              Anyone with {userEmailDomain} can join the workspace
            </Typography.Text>
            <Switch checked={domainJoiningEnabled} onChange={handleDomainToggle} />
          </div>
        </>
      )}

      <div className="workspace-onboarding-footer">
        <RQButton
          type="text"
          onClick={() => {
            trackOnboardingWorkspaceSkip(OnboardingSteps.CREATE_JOIN_WORKSPACE);
            dispatch(globalActions.updateWorkspaceOnboardingStep(OnboardingSteps.RECOMMENDATIONS));
          }}
        >
          Skip for now
        </RQButton>
        <RQButton
          type="primary"
          className="text-bold"
          onClick={() => {
            defaultTeamData ? handleAddMembers(newWorkspaceName) : handleCreateNewTeam();
          }}
          loading={isProcessing}
        >
          {defaultTeamData ? "Send invitations" : "Create workspace"}
        </RQButton>
      </div>
    </>
  );
};
