export const errorMessages = {
  'errors.requestInvalid': ['请求格式无效。', 'Invalid request format.'],
  'errors.pageUnsupported': [
    '此页面不支持插件操作。',
    'This page does not support extension actions.',
  ],
  'errors.configCacheRead': [
    '无法读取插件配置或雇主缓存。',
    'Unable to read extension settings or the employer cache.',
  ],
  'errors.settingsOpen': ['无法打开插件设置。', 'Unable to open extension settings.'],
  'errors.pageTaskMissing': [
    '此页面没有对应的运行中任务。',
    'No matching task is running on this page.',
  ],
  'errors.pageTaskRunning': [
    '此页面已有分析任务，请等待或停止当前任务。',
    'An analysis is already running on this page. Wait for it to finish or stop it.',
  ],
  'errors.taskRunning': ['任务已经在运行。', 'This task is already running.'],
  'errors.jobPageMismatch': [
    '职位详情与当前页面不一致，请打开完整职位后重试。',
    'The job details do not match the current page. Open the full job and try again.',
  ],
  'errors.autoNotReady': [
    '自动分析尚未启用，或所选分析服务需要重新配置。',
    'Automatic analysis is not enabled, or the selected analysis service needs updating.',
  ],
  'errors.taskStopped': ['任务已停止。', 'The task has stopped.'],
  'errors.analysisIncomplete': [
    '分析未完成，请刷新职位页面后重试。',
    'Analysis did not finish. Refresh the job page and try again.',
  ],
  'errors.keyAccessRequired': [
    '请先在插件设置中连接所选分析服务，并同意发送职位内容。',
    'Connect the selected analysis service and consent to sending job content in extension settings first.',
  ],
  'errors.consentRequired': [
    '请先同意将本次提交的职位字段发送给 TypeSafe。',
    'Please first consent to sending the submitted job fields to TypeSafe.',
  ],
  'errors.keyInvalid': ['请输入有效的 Jev API Key。', 'Enter a valid Jev API Key.'],
  'errors.autoForce': ['自动分析不能强制重试。', 'Automatic analysis cannot force a retry.'],
  'errors.localStopped': ['本地任务已停止。', 'The local task has stopped.'],
  'errors.keyAnalysisRequired': [
    '请先在设置中配置自己的 Jev Key 并启用分析。',
    'Add your own Jev Key and enable analysis in settings first.',
  ],
  'errors.apiPermission': [
    '请在设置中启用 TypeSafe API 访问权限。',
    'Enable TypeSafe API access in settings.',
  ],
  'errors.resultSave': [
    '结果未成功保存；已发出的调用不会自动重试。',
    'The result was not saved. Submitted calls will not be retried automatically.',
  ],
  'errors.recordIdentifier': ['记录标识格式无效。', 'Invalid record identifier format.'],
  'errors.jobTitleRequired': ['职位名称不能为空。', 'The job title cannot be empty.'],
  'errors.recordTime': ['记录时间无效。', 'Invalid record timestamp.'],
  'errors.sourceHttps': [
    '职位来源必须是有效且不含凭证的 HTTPS 链接。',
    'The job source must be a valid HTTPS link without credentials.',
  ],
  'errors.sourceUrl': ['职位来源链接无效。', 'Invalid job source link.'],
  'errors.modelMissing': ['Jev 记录缺少模型结果。', 'The Jev record is missing its model result.'],
  'errors.modelName': ['模型名称无效。', 'Invalid model name.'],
  'errors.modelRange': ['模型结果超出允许范围。', 'The model result is outside the allowed range.'],
  'errors.modelChoiceId': ['模型选项标识无效。', 'Invalid model choice identifier.'],
  'errors.evidencePosition': ['证据位置无效。', 'Invalid evidence offsets.'],
  'errors.evidenceBody': [
    '证据不匹配已保存的正文。',
    'The evidence does not match the saved job text.',
  ],
  'errors.taskUnconfirmed': [
    '调用已发出但未确认结果，不会自动重试；再次分析可能产生额外费用。',
    'The call was submitted, but its result is unconfirmed. It will not be retried automatically; another analysis may incur additional charges.',
  ],
  'errors.localInterrupted': [
    '本地任务已中断，请重新分析。',
    'The local task was interrupted. Please run the analysis again.',
  ],
  'errors.demoRemoved': [
    '此示例已移除，请打开实际职位进行分析。',
    'This example has been removed. Open an actual job to analyse it.',
  ],
  'errors.taskInactive': [
    '任务已删除、中断或过期，结果未写入；已发送的模型调用不会自动重试。',
    'The task was deleted, interrupted or expired, so the result was not saved. Submitted model calls will not be retried automatically.',
  ],
  'errors.taskSubmitted': [
    '此任务已提交，请查看历史记录；如需重试请重新点击分析。',
    'This task has already been submitted. Check its history, or click Analyse again to retry.',
  ],
  'errors.sameJobRunning': [
    '相同职位正在处理中，请等待当前任务结束。',
    'This job is already being processed. Wait for the current task to finish.',
  ],
  'errors.autoTaskExists': [
    '该职位已有分析任务，自动分析不会重试；请手动重试，已发出的调用可能产生费用。',
    'This job already has an analysis task. Automatic analysis will not retry it; retry manually if needed. Submitted calls may incur charges.',
  ],
  'errors.taskMissing': ['任务不存在或已被清除。', 'The task does not exist or has been cleared.'],
  'errors.taskStateChanged': [
    '任务状态已改变，不能重新启动或跳过结果保存。',
    'The task status has changed. It cannot be restarted or skip saving its result.',
  ],
  'errors.jobBackupCount': [
    '每份备份最多包含 1000 条记录。',
    'Each backup can contain at most 1,000 records.',
  ],
  'errors.jobBackupSize': ['备份文件不能超过 5 MB。', 'The backup file must not exceed 5 MB.'],
  'errors.jobBackupDuplicate': [
    '备份中存在重复的职位 ID，请先修正。',
    'The backup contains duplicate job IDs. Correct them before importing.',
  ],
  'errors.csvQuoteFormat': ['CSV 引号格式不正确', 'Invalid CSV quoting'],
  'errors.csvAfterQuote': [
    'CSV 引号后出现无效字符',
    'Invalid characters after a closing CSV quote',
  ],
  'errors.csvUnclosedQuote': ['CSV 引号未闭合', 'Unclosed CSV quote'],
  'errors.csvHeaders': ['CSV 表头无效', 'Invalid CSV headers'],
  'errors.csvColumns': ['CSV 列数不一致', 'Inconsistent CSV column count'],
  'errors.snapshotSize': ['快照超过大小上限', 'The snapshot exceeds the size limit'],
  'errors.snapshotRows': ['快照行数无效', 'Invalid snapshot row count'],
  'errors.employerRecord': ['雇主记录无效', 'Invalid employer record'],
  'errors.employerIdentity': [
    '雇主名称或 NZBN 无效/重复',
    'Invalid or duplicate employer name or NZBN',
  ],
  'errors.employerVerificationTime': [
    '雇主核验时间无效',
    'Invalid employer verification timestamp',
  ],
  'errors.localListVersion': ['本地名单版本无效', 'Invalid local list version'],
  'errors.snapshotDomain': ['快照域名无效', 'Invalid snapshot domain'],
  'errors.snapshotCatalogue': ['快照目录无效', 'Invalid snapshot catalogue'],
  'errors.snapshotCatalogueVersion': ['快照目录版本无效', 'Invalid snapshot catalogue version'],
  'errors.snapshotCatalogueFields': ['快照目录字段无效', 'Invalid snapshot catalogue fields'],
  'errors.snapshotOlder': [
    '发布目录旧于已缓存快照，保留原数据',
    'The published catalogue is older than the cached snapshot. Existing data has been kept',
  ],
  'errors.snapshotFileSize': ['快照文件大小不一致', 'Snapshot file size mismatch'],
  'errors.snapshotChecksum': ['快照校验和不一致', 'Snapshot checksum mismatch'],
  'errors.snapshotDatesMissing': [
    '快照缺少到期日或核验时间',
    'The snapshot is missing expiry or verification dates',
  ],
  'errors.snapshotCancelled': ['快照同步已取消', 'Snapshot sync was cancelled'],
  'errors.snapshotSync': ['快照同步失败', 'Snapshot sync failed'],
  'errors.importMetadata': ['导入来源或日期无效', 'Invalid import source or date'],
  'errors.verificationAfterSnapshot': [
    '雇主核验时间晚于名单生成时间',
    'The employer verification date is later than the list creation date',
  ],
  'errors.employerBackupSize': [
    '雇主备份不能超过 12 MiB。',
    'The employer backup must not exceed 12 MiB.',
  ],
  'errors.employerBackupEmpty': [
    '本地没有雇主名单可备份。',
    'There is no local employer list to back up.',
  ],
  'errors.employerBackupFormat': [
    '雇主备份格式或版本无效',
    'Invalid employer backup format or version',
  ],
  'errors.employerBackupFields': [
    '雇主备份记录包含无效字段',
    'The employer backup contains invalid record fields',
  ],
  'errors.employerNameInput': ['雇主名称输入无效', 'Invalid employer name input'],
  'errors.employerCheckCancelled': ['检查已取消', 'Check cancelled'],
  'errors.employerNameLength': [
    '公司名称不足或过长，需人工核实',
    'The company name is too short or too long. Manual verification is needed',
  ],
  'errors.snapshotNotDownloaded': [
    '尚未下载雇主公开快照',
    'No public employer snapshot has been downloaded yet',
  ],
  'errors.employerMatchNote': [
    '仅按名称匹配公开快照；不代表当前认证状态、实际聘用公司或职位签证支持。',
    'This is a name match against a public snapshot. It does not confirm current accreditation, the actual hiring employer or visa support for this job.',
  ],
  'errors.employerNoMatch': [
    '本地快照未找到完全一致的名称；不代表雇主未认证。',
    'No exact name match was found in the local snapshot. This does not mean the employer is unaccredited.',
  ],
  'errors.employerMultipleMatches': [
    '同名对应多个 NZBN，需核实实际聘用公司。',
    'This name matches multiple NZBNs. Verify the actual hiring employer.',
  ],
  'errors.employerCandidates': [
    '找到 {count} 个可能对应的雇主，显示 {shown} 个；仅名称相近，需核实实际聘用公司和 NZBN。未确认匹配不代表雇主未认证。',
    'Found {count} possible employers; showing {shown}. These are name suggestions only. Verify the actual hiring employer and NZBN. An unconfirmed match does not mean the employer is unaccredited.',
  ],
  'errors.employerExpiry': [
    '快照到期日已到、已过或无法确认；需到 INZ 核实当前状态。',
    'The snapshot expiry date has been reached, has passed or is unknown. Check the current status with INZ.',
  ],
  'errors.jev.invalidInput': [
    '职位文本或职业候选格式不正确，请检查输入。',
    'Invalid job text or occupation candidates. Please check the input.',
  ],
  'errors.jev.unauthorized': [
    'TypeSafe 拒绝了 API Key，请检查 Key。',
    'TypeSafe rejected the API Key. Please check it.',
  ],
  'errors.jev.forbidden': [
    'TypeSafe 拒绝访问，请检查账户权限。',
    'TypeSafe denied access. Check your account permissions.',
  ],
  'errors.jev.rateLimited': [
    'TypeSafe 已明确返回限流，请稍后手动重试。',
    'TypeSafe returned a rate limit response. Retry manually later.',
  ],
  'errors.jev.requestRejected': [
    'TypeSafe 拒绝了请求，请检查输入或更新插件。',
    'TypeSafe rejected the request. Check the input or update the extension.',
  ],
  'errors.jev.providerError': [
    'TypeSafe 服务发生异常，本次请求结果不明；未自动重试。',
    'TypeSafe encountered an error. The request outcome is unknown; no automatic retry was made.',
  ],
  'errors.jev.networkError': [
    '网络中断，本次请求结果不明；未自动重试。',
    'The network connection was interrupted. The request outcome is unknown; no automatic retry was made.',
  ],
  'errors.jev.timeout': [
    '分析超时，本次请求结果不明；未自动重试。',
    'Analysis timed out. The request outcome is unknown; no automatic retry was made.',
  ],
  'errors.jev.aborted': [
    '分析已停止；已发送的请求可能仍被处理。',
    'Analysis stopped. Submitted requests may still be processed.',
  ],
  'errors.jev.retryFailed': [
    '自动重试后仍未完成分析，请稍后再试。',
    'Analysis could not be completed after automatic retrying. Please try again later.',
  ],
  'errors.jev.invalidResponse': [
    'TypeSafe 返回内容未通过校验，本次请求结果不明；未自动重试。',
    'The TypeSafe response failed validation. The request outcome is unknown; no automatic retry was made.',
  ],
  'errors.snapshotDownload': ['快照下载失败 ({status})', 'Snapshot download failed ({status})'],
} as const;
