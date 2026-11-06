import {
  ClockIcon,
  EditIcon,
  EllipsisVerticalIcon,
  ErrorOutlineIcon,
  LaunchIcon,
  LockIcon,
  RefreshIcon,
  TrashIcon,
} from '@sanity/icons'
import {Badge, Box, Button, Card, Dialog, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {Menu, MenuButton, MenuDivider, MenuItem} from '@sanity/ui/menu'
import {Tooltip} from '@sanity/ui/tooltip'
import {useToast} from '@sanity/ui/toast'
import {useId, useState} from 'react'

import {cancelBuild, isActive, resolveTarget, startBuild} from './api'
import {IS_PRODUCTION} from './constants'
import {DeployForm} from './DeployForm'
import {DeployHistory} from './DeployHistory'
import {toDeployment, toPending, updateDeployment} from './documents'
import {duration, formatDate, timeAgo} from './format'
import {useClient, useDeploymentBuilds, useNow} from './hooks'
import {StatusBadge} from './StatusBadge'
import type {CloudflareDeployment, PendingDeployment} from './types'

interface Props {
  deployment: CloudflareDeployment
  apiBaseUrl: string
  /** Shared token from the tool settings, used when the deployment has none. */
  sharedToken?: string
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function DeployCard({deployment, apiBaseUrl, sharedToken}: Props) {
  const id = useId()
  const client = useClient()
  const toast = useToast()
  const token = deployment.accessToken || sharedToken
  const locked = Boolean(deployment.predefined)

  const {target, builds, latest, error, isLoading, isPolling, refresh, expectBuild} =
    useDeploymentBuilds(apiBaseUrl, deployment, token)

  const [isTriggering, setIsTriggering] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pending, setPending] = useState<PendingDeployment>(() => toPending(deployment))

  const running = latest ? isActive(latest.state) : false
  const now = useNow(running)
  const busy = isTriggering || running || isPolling

  const onDeploy = async () => {
    if (!target || !token) return
    setIsTriggering(true)
    try {
      await startBuild(apiBaseUrl, token, deployment, target)
      expectBuild()
      toast.push({status: 'success', title: `Build started: ${deployment.name}`})
      await refresh()
    } catch (err) {
      toast.push({status: 'error', title: 'Could not start the build', description: messageOf(err)})
    } finally {
      setIsTriggering(false)
    }
  }

  const onCancel = async () => {
    if (!latest || !token) return
    setIsCanceling(true)
    try {
      await cancelBuild(apiBaseUrl, token, deployment, latest)
      toast.push({status: 'success', title: 'Build canceled'})
      await refresh()
    } catch (err) {
      toast.push({status: 'error', title: 'Could not cancel the build', description: messageOf(err)})
    } finally {
      setIsCanceling(false)
    }
  }

  const onSaveEdit = async () => {
    setIsSaving(true)
    try {
      const candidate = toDeployment(pending, deployment._id)
      await resolveTarget(apiBaseUrl, candidate.accessToken || token || '', candidate)
      await updateDeployment(client, deployment._id, pending)
      toast.push({status: 'success', title: `Updated ${pending.name}`})
      setIsEditOpen(false)
    } catch (err) {
      toast.push({status: 'error', title: 'Could not save', description: messageOf(err)})
    } finally {
      setIsSaving(false)
    }
  }

  const onDelete = async () => {
    setIsSaving(true)
    try {
      await client.delete(deployment._id)
      toast.push({status: 'success', title: `Deleted ${deployment.name}`})
    } catch (err) {
      toast.push({status: 'error', title: 'Could not delete', description: messageOf(err)})
      setIsSaving(false)
    }
  }

  const status = error ? 'error' : isLoading ? 'loading' : latest ? latest.state : 'none'
  const canDelete = !locked && !(IS_PRODUCTION && deployment.disableDeleteAction)
  const subject = deployment.kind === 'pages' ? deployment.pagesProject : deployment.workerName

  return (
    <Stack gap={4}>
      <Flex align="flex-start" gap={2}>
        <Stack gap={3} flex={1} style={{minWidth: 0}}>
          <Flex align="center" gap={2} wrap="wrap">
            <Heading as="h2" size={1}>
              {deployment.name}
            </Heading>
            <Badge tone="primary" padding={2} radius={2} fontSize={0}>
              {deployment.kind === 'pages' ? 'Pages' : 'Workers'}
            </Badge>
          </Flex>
          <Flex align="center" gap={2} wrap="wrap">
            <Code size={1}>{subject}</Code>
            {target && (
              <Text size={1} muted>
                on <Code size={1}>{target.branch}</Code>
              </Text>
            )}
          </Flex>
          {(target?.triggerName || target?.repo) && (
            <Text size={1} muted>
              {[target.triggerName && `Trigger: ${target.triggerName}`, target.repo]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
        </Stack>

        {locked && (
          <Tooltip content={<Text size={1}>Defined in the Studio config</Text>} portal placement="top">
            <Box padding={2}>
              <Text muted>
                <LockIcon />
              </Text>
            </Box>
          </Tooltip>
        )}

        <MenuButton
          id={`${id}-menu`}
          button={<Button mode="bleed" icon={EllipsisVerticalIcon} aria-label="Deployment actions" />}
          popover={{portal: true, placement: 'bottom-end'}}
          menu={
            <Menu>
              <MenuItem text="History" icon={ClockIcon} onClick={() => setIsHistoryOpen(true)} />
              <MenuItem text="Refresh" icon={RefreshIcon} onClick={() => refresh()} />
              {latest && (
                <MenuItem
                  text="Open latest in Cloudflare"
                  icon={LaunchIcon}
                  as="a"
                  href={latest.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              )}
              {!locked && (
                <MenuItem
                  text="Edit"
                  icon={EditIcon}
                  onClick={() => {
                    setPending(toPending(deployment))
                    setIsEditOpen(true)
                  }}
                />
              )}
              {canDelete && (
                <>
                  <MenuDivider />
                  <MenuItem
                    text="Delete"
                    icon={TrashIcon}
                    tone="critical"
                    onClick={() => setIsDeleteOpen(true)}
                  />
                </>
              )}
            </Menu>
          }
        />
      </Flex>

      {error && (
        <Card tone="critical" padding={3} radius={2} border>
          <Flex gap={2} align="flex-start">
            <Text size={1}>
              <ErrorOutlineIcon />
            </Text>
            <Text size={1}>{error}</Text>
          </Flex>
        </Card>
      )}

      <Flex align="center" justify="space-between" gap={3} wrap="wrap">
        <Flex align="center" gap={2}>
          <StatusBadge state={status} />
          {latest && (
            <Tooltip content={<Text size={1}>{formatDate(latest.createdAt)}</Text>} portal placement="top">
              <Text size={1} muted>
                {running ? duration(latest.createdAt, undefined, now) : timeAgo(latest.createdAt)}
              </Text>
            </Tooltip>
          )}
        </Flex>

        <Flex gap={2}>
          {running && target?.canCancel && (
            <Button
              mode="ghost"
              tone="critical"
              text="Cancel"
              loading={isCanceling}
              onClick={onCancel}
            />
          )}
          <Button
            tone="positive"
            text="Deploy"
            loading={busy}
            disabled={busy || !target}
            onClick={onDeploy}
          />
        </Flex>
      </Flex>

      {isHistoryOpen && (
        <Dialog
          id={`${id}-history`}
          header={`Builds: ${deployment.name}`}
          width={2}
          onClose={() => setIsHistoryOpen(false)}
          onClickOutside={() => setIsHistoryOpen(false)}
        >
          <DeployHistory builds={builds} />
        </Dialog>
      )}

      {isEditOpen && (
        <DeployForm
          header="Edit deployment"
          values={pending}
          setValues={setPending}
          onClose={() => setIsEditOpen(false)}
          onSubmit={onSaveEdit}
          submitText="Save"
          loading={isSaving}
          hasSavedToken={Boolean(deployment.accessToken)}
          hideDisableDeleteAction={IS_PRODUCTION && deployment.disableDeleteAction}
        />
      )}

      {isDeleteOpen && (
        <Dialog
          id={`${id}-delete`}
          header="Delete deployment"
          width={1}
          onClose={() => setIsDeleteOpen(false)}
          footer={
            <Box padding={3}>
              <Grid gridTemplateColumns={2} gap={3}>
                <Button mode="ghost" text="Cancel" onClick={() => setIsDeleteOpen(false)} />
                <Button tone="critical" text="Delete" loading={isSaving} onClick={onDelete} />
              </Grid>
            </Box>
          }
        >
          <Box padding={4}>
            <Text>
              Delete <strong>{deployment.name}</strong> from the Studio? Nothing changes on
              Cloudflare.
            </Text>
          </Box>
        </Dialog>
      )}
    </Stack>
  )
}
