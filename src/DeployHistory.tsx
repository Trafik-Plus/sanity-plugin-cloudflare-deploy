import {LaunchIcon} from '@sanity/icons'
import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {Tooltip} from '@sanity/ui/tooltip'

import {duration, formatDate, timeAgo} from './format'
import {StatusBadge} from './StatusBadge'
import type {Build} from './types'

const ellipsis = {whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'} as const

export function DeployHistory({builds}: {builds: Build[]}) {
  if (!builds.length) {
    return (
      <Box padding={4}>
        <Text muted align="center">
          No builds yet.
        </Text>
      </Box>
    )
  }

  return (
    <Stack as="ul" gap={0} padding={0} style={{listStyle: 'none', margin: 0}}>
      {builds.map((build) => (
        <Card as="li" key={build.id} padding={4} borderBottom>
          <Flex align="center" gap={3}>
            <Box style={{minWidth: '6rem'}}>
              <StatusBadge state={build.state} />
            </Box>
            <Stack gap={2} flex={1} style={{minWidth: 0}}>
              <Text size={1} weight="medium" style={ellipsis}>
                {build.commitMessage || build.source || 'Manual build'}
              </Text>
              <Flex gap={2} align="center" wrap="wrap">
                {build.branch && <Code size={0}>{build.branch}</Code>}
                {build.commitHash && <Code size={0}>{build.commitHash.slice(0, 7)}</Code>}
                {build.author && (
                  <Text size={0} muted>
                    {build.author}
                  </Text>
                )}
              </Flex>
            </Stack>
            <Stack gap={2} style={{textAlign: 'right'}}>
              <Tooltip content={<Text size={1}>{formatDate(build.createdAt)}</Text>} portal placement="top">
                <Text size={1} muted style={{whiteSpace: 'nowrap'}}>
                  {timeAgo(build.createdAt)}
                </Text>
              </Tooltip>
              {build.finishedAt && (
                <Text size={0} muted>
                  {duration(build.createdAt, build.finishedAt)}
                </Text>
              )}
            </Stack>
            <Button
              as="a"
              href={build.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              icon={LaunchIcon}
              mode="bleed"
              aria-label="Open in Cloudflare dashboard"
              title="Open in Cloudflare dashboard"
            />
          </Flex>
        </Card>
      ))}
    </Stack>
  )
}
