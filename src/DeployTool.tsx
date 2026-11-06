import {AddIcon, CogIcon} from '@sanity/icons'
import {Box, Button, Card, Container, Dialog, Flex, Grid, Heading, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {useMemo, useState} from 'react'
import type {Tool} from 'sanity'
import {Field} from './Field'

import {resolveTarget} from './api'
import {DEFAULT_API_BASE_URL, DEPLOYMENTS_QUERY, DEPLOYMENT_TYPE, EMPTY_PENDING, SECRETS_ID} from './constants'
import {DeployCard} from './DeployCard'
import {DeployForm} from './DeployForm'
import {createDeployment, saveSharedToken, toDeployment} from './documents'
import {useClient, useLiveDocuments} from './hooks'
import type {CloudflareDeployConfig, CloudflareDeployment, PendingDeployment, SecretsDocument} from './types'

const SECRETS_QUERY = `*[_id == "${SECRETS_ID}"]`
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function DeployTool({tool}: {tool: Tool<CloudflareDeployConfig>}) {
  const client = useClient()
  const toast = useToast()
  const apiBaseUrl = tool.options?.apiBaseUrl || DEFAULT_API_BASE_URL
  const configured = tool.options?.deployments

  const stored = useLiveDocuments<CloudflareDeployment>(DEPLOYMENTS_QUERY)
  const secrets = useLiveDocuments<SecretsDocument>(SECRETS_QUERY)
  const sharedToken = secrets.data[0]?.accessToken

  const predefined = useMemo<CloudflareDeployment[]>(
    () =>
      (configured ?? []).map((item, index) => ({
        _id: `predefined.${index}`,
        _type: DEPLOYMENT_TYPE,
        ...item,
        predefined: true,
      })),
    [configured],
  )
  const deployments = [...predefined, ...stored.data]

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isTokenOpen, setIsTokenOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pending, setPending] = useState<PendingDeployment>(EMPTY_PENDING)
  const [pendingToken, setPendingToken] = useState('')

  const needsSharedToken = predefined.length > 0 && !secrets.isLoading && !sharedToken

  const onCreate = async () => {
    setIsSaving(true)
    try {
      // Validate against Cloudflare before saving, so a typo fails here, not on Deploy.
      const candidate = toDeployment(pending)
      await resolveTarget(apiBaseUrl, candidate.accessToken ?? '', candidate)
      await createDeployment(client, pending)
      toast.push({status: 'success', title: `Added ${pending.name}`})
      setIsCreateOpen(false)
      setPending(EMPTY_PENDING)
    } catch (err) {
      toast.push({status: 'error', title: 'Could not add the deployment', description: messageOf(err)})
    } finally {
      setIsSaving(false)
    }
  }

  const onSaveToken = async () => {
    setIsSaving(true)
    try {
      await saveSharedToken(client, pendingToken)
      toast.push({status: 'success', title: 'Saved the shared API token'})
      setIsTokenOpen(false)
      setPendingToken('')
    } catch (err) {
      toast.push({status: 'error', title: 'Could not save the token', description: messageOf(err)})
    } finally {
      setIsSaving(false)
    }
  }

  const isLoading = stored.isLoading || secrets.isLoading

  return (
    <Box height="fill" overflow="auto">
      <Container width={3} padding={4}>
        <Stack gap={4}>
          <Flex align="center" gap={2}>
            <Box flex={1}>
              <Heading as="h1" size={2}>
                Cloudflare deployments
              </Heading>
            </Box>
            {predefined.length > 0 && (
              <Button
                mode="ghost"
                icon={CogIcon}
                aria-label="Shared API token"
                title="Shared API token"
                onClick={() => setIsTokenOpen(true)}
              />
            )}
            <Button
              tone="primary"
              icon={AddIcon}
              text="Add deployment"
              onClick={() => setIsCreateOpen(true)}
            />
          </Flex>

          {stored.error && (
            <Card tone="critical" padding={3} radius={2} border>
              <Text size={1}>{stored.error.message}</Text>
            </Card>
          )}

          {needsSharedToken && (
            <Card tone="caution" padding={4} radius={2} border>
              <Flex align="center" gap={3} wrap="wrap">
                <Box flex={1}>
                  <Text size={1}>
                    Deployments defined in the Studio config need a shared Cloudflare API token.
                  </Text>
                </Box>
                <Button tone="caution" text="Add token" onClick={() => setIsTokenOpen(true)} />
              </Flex>
            </Card>
          )}

          {isLoading ? (
            <Flex justify="center" padding={5}>
              <Spinner muted />
            </Flex>
          ) : deployments.length ? (
            <Grid as="ul" gridTemplateColumns={[1, 1, 2]} gap={3} style={{listStyle: 'none', margin: 0, padding: 0}}>
              {deployments.map((deployment) => (
                <Card as="li" key={deployment._id} padding={4} radius={3} shadow={1}>
                  <DeployCard
                    deployment={deployment}
                    apiBaseUrl={apiBaseUrl}
                    sharedToken={sharedToken}
                  />
                </Card>
              ))}
            </Grid>
          ) : (
            <Card padding={5} radius={3} border>
              <Stack gap={4}>
                <Text align="center" weight="medium">
                  No deployments yet
                </Text>
                <Text align="center" size={1} muted>
                  Add a Worker connected to Git or a Pages project to rebuild the site from here.
                </Text>
                <Flex justify="center">
                  <Button
                    tone="primary"
                    icon={AddIcon}
                    text="Add deployment"
                    onClick={() => setIsCreateOpen(true)}
                  />
                </Flex>
              </Stack>
            </Card>
          )}
        </Stack>
      </Container>

      {isCreateOpen && (
        <DeployForm
          header="New deployment"
          values={pending}
          setValues={setPending}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={onCreate}
          submitText="Add"
          loading={isSaving}
        />
      )}

      {isTokenOpen && (
        <Dialog
          id="cloudflare-deploy-shared-token"
          header="Shared API token"
          width={1}
          onClose={() => setIsTokenOpen(false)}
          footer={
            <Box padding={3}>
              <Grid gridTemplateColumns={2} gap={3}>
                <Button mode="ghost" text="Cancel" onClick={() => setIsTokenOpen(false)} />
                <Button
                  tone="primary"
                  text="Save"
                  loading={isSaving}
                  disabled={isSaving || !pendingToken.trim()}
                  onClick={onSaveToken}
                />
              </Grid>
            </Box>
          }
        >
          <Box padding={4}>
            <Field
              title={sharedToken ? 'Replace API token' : 'API token'}
              description="Used by the deployments defined in the Studio config. Stored in a private document (secrets.cloudflareDeploy)."
            >
              <TextInput
                type="password"
                autoComplete="off"
                value={pendingToken}
                placeholder={sharedToken ? '••••••••' : undefined}
                onChange={(event) => setPendingToken(event.currentTarget.value)}
              />
            </Field>
          </Box>
        </Dialog>
      )}
    </Box>
  )
}
