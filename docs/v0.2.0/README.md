# FlowPilot v0.2.0 迭代需求

---

## 前置调整

移除截图页面（Screenshots），其功能已被数据记录页面覆盖。

---

## 需求列表

| # | 需求 | 文档 |
|---|------|------|
| 1 | 搜索与筛选 | [req-1-keyword-filter.html](./req-1-keyword-filter.html) |
| 2 | 批量标记 | [req-2-batch-tagging.html](./req-2-batch-tagging.html) |
| 3 | 下载捕获 | [req-3-download-capture.html](./req-3-download-capture.html) |
| 4 | 附件 OCR | [req-4-attachment-ocr.html](./req-4-attachment-ocr.html) |

---

## 验收标准

1. 关键字筛选覆盖字段值、截图 OCR 文本和附件 OCR 文本
2. 排除关键字生效
3. 时间筛选与关键字筛选可组合
4. 预设可保存、加载、编辑、删除
5. 筛选后可全选/选择部分记录，点击"打标签"批量打标
6. 打标签弹窗支持选择已有标签或输入新标签
7. 流程设置中支持配置下载处理方式（忽略 / 捕获为附件 / 保留并捕获）
8. 捕获的附件关联到数据记录
9. 捕获的图片和 PDF 附件自动进行 OCR 识别，结果纳入关键字筛选搜索范围
10. 截图页面已移除，数据记录中截图和 OCR 功能正常
