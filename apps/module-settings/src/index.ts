export { SettingsPage } from './SettingsPage';
export { manifest } from './manifest';
export { useSettingsData } from './hooks/useSettings';
export {
  applySettingsTheme,
  createCommunicationTemplate,
  createEmptySettings,
  DEFAULT_SETTINGS,
  deleteCommunicationTemplate,
  DOCUMENT_PREFIX_LABELS,
  fetchCommunicationSettings,
  fetchCommunicationTemplates,
  fetchSettings,
  saveCommunicationSettings,
  saveSettings,
  updateCommunicationTemplate,
} from './api';
export type {
  CommunicationAttachmentType,
  CommunicationCategory,
  CommunicationSenderSettings,
  CommunicationTemplate,
  SettingsDto,
  DocumentPrefix,
  DocumentPrefixKey,
} from './types';
