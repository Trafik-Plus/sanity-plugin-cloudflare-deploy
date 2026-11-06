import {Box, Button, Card, Dialog, Flex, Grid, Radio, Stack, Switch, Text, TextInput} from '@sanity/ui'
import {useId, type Dispatch, type ReactNode, type SetStateAction} from 'react'
import {Field} from './Field'

import type {PendingDeployment} from './types'

interface Props {
  header: string
  values: PendingDeployment
  setValues: Dispatch<SetStateAction<PendingDeployment>>
  onClose: () => void
  onSubmit: () => void
  submitText: string
  loading?: boolean
  /** Editing: the saved token stays unless a new one is typed. */
  hasSavedToken?: boolean
  hideDisableDeleteAction?: boolean
}

export function DeployForm({
  header,
  values,
  setValues,
  onClose,
  onSubmit,
  submitText,
  loading,
  hasSavedToken,
  hideDisableDeleteAction,
}: Props) {
  const id = useId()
  const set =
    <K extends keyof PendingDeployment>(key: K) =>
    (value: PendingDeployment[K]) =>
      setValues((prev) => ({...prev, [key]: value}))
  const text = (key: 'name' | 'accountId' | 'workerName' | 'pagesProject' | 'branch' | 'accessToken') =>
    (event: React.FormEvent<HTMLInputElement>) => set(key)(event.currentTarget.value)

  const isWorkers = values.kind === 'workers'
  const isValid =
    values.name.trim() &&
    values.accountId.trim() &&
    (isWorkers ? values.workerName.trim() : values.pagesProject.trim()) &&
    (hasSavedToken || values.accessToken.trim())

  return (
    <Dialog
      animate
      header={header}
      id={`${id}-dialog`}
      width={1}
      onClickOutside={onClose}
      onClose={onClose}
      footer={
        <Box padding={3}>
          <Grid gridTemplateColumns={2} gap={3}>
            <Button padding={3} mode="ghost" text="Cancel" onClick={onClose} />
            <Button
              padding={3}
              text={submitText}
              tone="primary"
              loading={loading}
              disabled={loading || !isValid}
              onClick={onSubmit}
            />
          </Grid>
        </Box>
      }
    >
      <Box padding={4}>
        <Stack gap={5}>
          <Field
            title="Display name"
            description="Internal label, such as Production or Staging."
          >
            <TextInput value={values.name} onChange={text('name')} />
          </Field>

          <Field title="Product">
            <Stack gap={3}>
              <Choice
                id={`${id}-workers`}
                checked={isWorkers}
                onChange={() => set('kind')('workers')}
                title="Workers Builds"
                description="A Worker connected to a Git repository."
              />
              <Choice
                id={`${id}-pages`}
                checked={!isWorkers}
                onChange={() => set('kind')('pages')}
                title="Pages"
                description="A Cloudflare Pages project."
              />
            </Stack>
          </Field>

          <Field
            title="Account ID"
            description="Cloudflare dashboard → Workers & Pages → Account details → Account ID."
          >
            <TextInput value={values.accountId} onChange={text('accountId')} />
          </Field>

          {isWorkers ? (
            <Field title="Worker name" description="The Worker's name as shown in the dashboard.">
              <TextInput value={values.workerName} onChange={text('workerName')} />
            </Field>
          ) : (
            <Field title="Pages project" description="The project's name as shown in the dashboard.">
              <TextInput value={values.pagesProject} onChange={text('pagesProject')} />
            </Field>
          )}

          <Field
            title="Branch"
            description={
              isWorkers
                ? 'Branch to build. Empty builds main. The plugin picks the build trigger that covers this branch.'
                : "Branch to deploy. Empty deploys the project's production branch."
            }
          >
            <TextInput value={values.branch} placeholder="main" onChange={text('branch')} />
          </Field>

          <Field
            title="API token"
            description={
              <>
                Create one under My Profile → API Tokens with{' '}
                {isWorkers ? (
                  <>
                    <strong>Workers Builds Configuration: Edit</strong> and{' '}
                    <strong>Workers Scripts: Read</strong>
                  </>
                ) : (
                  <strong>Cloudflare Pages: Edit</strong>
                )}
                , scoped to this account.
                {hasSavedToken ? ' Leave empty to keep the saved token.' : ''}
              </>
            }
          >
            <TextInput
              type="password"
              autoComplete="off"
              value={values.accessToken}
              placeholder={hasSavedToken ? '••••••••' : undefined}
              onChange={text('accessToken')}
            />
          </Field>

          {!hideDisableDeleteAction && (
            <Card tone="caution" padding={3} radius={2} border>
              <Flex align="center" gap={3}>
                <Switch
                  id={`${id}-lock`}
                  checked={values.disableDeleteAction}
                  onChange={(event) => set('disableDeleteAction')(event.currentTarget.checked)}
                />
                <Stack as="label" gap={2} flex={1} htmlFor={`${id}-lock`} style={{cursor: 'pointer'}}>
                  <Text size={1} weight="medium">
                    Prevent deletion in production
                  </Text>
                  <Text size={1} muted>
                    Hides Delete in production builds of the Studio.
                  </Text>
                </Stack>
              </Flex>
            </Card>
          )}
        </Stack>
      </Box>
    </Dialog>
  )
}

function Choice(props: {
  id: string
  checked: boolean
  onChange: () => void
  title: string
  description: ReactNode
}) {
  return (
    <Flex align="flex-start" gap={3}>
      <Radio id={props.id} checked={props.checked} onChange={props.onChange} />
      <Stack as="label" gap={2} htmlFor={props.id} style={{cursor: 'pointer'}}>
        <Text size={1} weight="medium">
          {props.title}
        </Text>
        <Text size={1} muted>
          {props.description}
        </Text>
      </Stack>
    </Flex>
  )
}
