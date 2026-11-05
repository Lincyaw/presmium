export const MEDIA_UPLOAD_MESSAGES = {
  'zh-CN': { image: '上传图片', audio: '上传音频', choose: '选择文件', sending: '正在上传…', ready: '上传完成。请返回助手继续导入。', pending: '选择文件后自动上传，再由助手导入讲义。', failed: '上传未完成。请重新选择文件后重试。', unavailable: '此上传链接已失效，请返回助手重新发起上传。', limit: (size: number) => `文件大小上限：${size} MiB` },
  en: { image: 'Upload Image', audio: 'Upload Audio', choose: 'Choose File', sending: 'Uploading…', ready: 'Upload complete. Return to the assistant to import it.', pending: 'Choose a file to upload it, then return to the assistant to import it.', failed: 'Upload did not finish. Choose the file and try again.', unavailable: 'This upload link expired. Return to the assistant to request another.', limit: (size: number) => `Maximum file size: ${size} MiB` },
}
