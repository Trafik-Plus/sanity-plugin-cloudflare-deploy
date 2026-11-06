import {Stack, Text} from '@sanity/ui'
import type {ReactNode} from 'react'

/** Label + description + input. Sanity's FormField needs a document path; dialogs have none. */
export function Field({title, description, children}: {title: string; description?: ReactNode; children: ReactNode}) {
  return (
    <Stack gap={3}>
      <Stack gap={2}>
        <Text size={1} weight="medium">
          {title}
        </Text>
        {description && (
          <Text size={1} muted>
            {description}
          </Text>
        )}
      </Stack>
      {children}
    </Stack>
  )
}
