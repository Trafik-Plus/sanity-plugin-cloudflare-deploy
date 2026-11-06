import {RocketIcon} from '@sanity/icons'
import {definePlugin} from 'sanity'
import {route} from 'sanity/router'

import {DeployTool} from './DeployTool'
import type {CloudflareDeployConfig} from './types'

/**
 * Adds a Deploy tool to the Studio navbar that triggers and monitors
 * Cloudflare Workers Builds and Pages deployments.
 */
export const cloudflareDeployTool = definePlugin<CloudflareDeployConfig | void>((options) => {
  const {name, title, icon, ...config} = options || {}

  return {
    name: 'sanity-plugin-cloudflare-deploy',
    tools: [
      {
        name: name || 'cloudflare-deploy',
        title: title || 'Deploy',
        icon: icon || RocketIcon,
        component: DeployTool,
        options: config,
        router: route.create('/*'),
      },
    ],
  }
})

export {pickTrigger} from './api'
export type {
  Build,
  BuildState,
  CloudflareDeployConfig,
  CloudflareDeployment,
  DeployKind,
  PredefinedDeployment,
} from './types'
