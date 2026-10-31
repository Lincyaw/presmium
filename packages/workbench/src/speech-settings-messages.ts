import type { Locale } from './messages.ts'

const zh = {
  title: '语音服务', provider: '火山引擎', service: '默认服务', model: '语音合成 2.0',
  description: '配置此工作区的配音服务，保存后立即生效。',
  key: '语音 API Key', keyPlaceholder: '输入语音控制台的 API Key', keySaved: '已配置，留空保留',
  keyHint: '在火山语音控制台的 API 管理中创建。',
  console: '打开语音控制台',
  source: { saved: '使用本机保存的密钥', environment: '使用启动环境中的密钥', none: '尚未配置密钥' },
  configured: '已配置，尚未验证服务权限', unconfigured: '未配置',
  verification: '检查配置仅检查已保存的本机设置，服务权限在首次试听时验证。请先开通语音合成服务；试听与生成需明确确认，可能产生服务费用。',
  privacy: '密钥仅保存在本机此工作区的服务配置中，不写入讲义。',
  check: '检查配置', save: '保存', saved: '语音服务已保存，无需重启。', checked: '本机配置可用。请通过试听验证服务权限。',
  remove: '清除已保存密钥', removeTitle: '清除语音服务密钥', removeHint: '清除本机保存的密钥后恢复启动环境中的配置；讲稿、音色选择和已有配音保留。', cancel: '取消',
  cleared: '已清除本机保存的密钥。', retry: '重新加载', loading: '正在加载语音服务设置…',
  unavailable: '无法读取语音服务设置，请重试。', invalid: '请输入有效的语音 API Key。',
  conflict: '设置已在别处更新。当前输入已保留，请重新加载后再保存。', busy: '设置正在被更新，请稍后重试。',
  failed: '无法保存语音服务设置。当前输入已保留，请重试。',
}
export const SPEECH_SETTINGS_MESSAGES: Record<Locale, typeof zh> = {
  'zh-CN': zh,
  en: {
    title: 'Voice Service', provider: 'Volcengine', service: 'Default service', model: 'Speech synthesis 2.0',
    description: 'Configure voiceover for this workspace. Saved settings apply immediately.',
    key: 'API Key', keyPlaceholder: 'Enter the speech console API key', keySaved: 'Configured; leave blank to keep',
    keyHint: 'Create an API key in the Volcengine speech console’s API management page.',
    console: 'Open Speech Console',
    source: { saved: 'Using a key saved on this machine', environment: 'Using the launch environment key', none: 'No key configured' },
    configured: 'Configured; service permissions not verified', unconfigured: 'Not configured',
    verification: 'Checking configuration checks saved local settings. Service permissions are verified when you first play a sample. Enable speech synthesis first; samples and generation require confirmation and may incur service charges.',
    privacy: 'The key stays in this workspace’s service settings on this machine, outside the document.',
    check: 'Check Configuration', save: 'Save', saved: 'Voice service saved. No restart is needed.', checked: 'Local settings are available. Play a sample to verify service permissions.',
    remove: 'Clear Saved Key', removeTitle: 'Clear Voice Service Key', removeHint: 'Clearing the saved key restores the launch environment configuration. Scripts, voice choices, and generated audio are kept.', cancel: 'Cancel',
    cleared: 'The saved key was cleared.', retry: 'Reload', loading: 'Reading voice service settings…',
    unavailable: 'Couldn’t read voice service settings. Try again.', invalid: 'Enter a valid speech API key.',
    conflict: 'Settings changed elsewhere. Your input is kept; reload before saving.', busy: 'Settings are being updated. Try again shortly.', failed: 'Couldn’t save voice service settings. Your input is kept; try again.',
  },
}
