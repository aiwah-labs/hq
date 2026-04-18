export {
  createFolder,
  ensureFolder,
  getFolder,
  getFolderByPath,
  listFolders,
  renameFolder,
  moveFolder,
  deleteFolder,
} from './folders.js';
export type { CreateFolderInput, FolderKind, ListFoldersOptions } from './folders.js';

export {
  beginUpload,
  completeUpload,
  uploadDirect,
  getFile,
  openFileStream,
  resolveDownloadUrl,
  moveFile,
  renameFile,
  updateFileMetadata,
  deleteFile,
} from './files.js';
export type {
  BeginUploadInput,
  BeginUploadResult,
  CompleteUploadInput,
  UploadDirectInput,
  UpdateFileMetadataInput,
} from './files.js';

export {
  searchFiles,
  setFileSearchBackend,
  getFileSearchBackend,
} from './search.js';
export type { FileSearchOptions, FileSearchBackend, FileSearchResult } from './search.js';

export { sweepTempFiles } from './sweep.js';
export type { SweepResult } from './sweep.js';
