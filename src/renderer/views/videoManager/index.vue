<template>
  <div class="page-shell video-manager-page">
    <div class="page-header">
      <h1 class="page-title">视频管理</h1>
      <p class="page-desc">选择视频或目录发布，查看本地发布记录与审核状态</p>
    </div>

    <div class="toolbar section-card el-card is-never-shadow">
      <div class="toolbar-inner">
        <div class="toolbar-left">
          <el-button
            type="primary"
            class="action-btn-primary"
            @click="selectVideoFile"
          >
            <svg-icon icon-class="video-publish" class="btn-svg-icon" />
            <span>选择视频发布</span>
          </el-button>
          <el-button
            plain
            class="action-btn-secondary"
            @click="openDirectoryPublish"
          >
            <svg-icon icon-class="folder-batch" class="btn-svg-icon" />
            <span>目录发布</span>
          </el-button>
          <el-button
            plain
            class="action-btn-article"
            @click="openArticlePublish"
          >
            <svg-icon icon-class="article-edit" class="btn-svg-icon" />
            <span>发布文章</span>
          </el-button>
        </div>
        <div class="toolbar-right">
          <el-button
            size="small"
            plain
            class="action-btn-export"
            :loading="exportingHistory"
            @click="exportHistory"
          >
            <svg-icon icon-class="download-export" class="btn-svg-icon" />
            <span>导出记录</span>
          </el-button>
        </div>
      </div>
    </div>

    <LocalVideoPublish ref="localPublishRef" @published="loadRecords" />
    <LocalArticlePublish ref="articlePublishRef" @published="loadRecords" />

    <div class="info-box">
      <div v-if="!hasRecords" class="empty-records-card">
        <div class="empty-icon-wrap">
          <svg-icon icon-class="video-publish" class="empty-svg-icon" />
        </div>
        <h3 class="empty-title">暂无发布记录</h3>
        <p class="empty-desc">选择视频并勾选账号即可开启一键多平台自媒体矩阵分发</p>
        <el-button type="primary" size="small" class="empty-action-btn" @click="selectVideoFile">
          <svg-icon icon-class="video-publish" class="btn-svg-icon" />
          <span>立即选择视频发布</span>
        </el-button>
      </div>
      <template v-else v-for="(item, index) in dataList">
        <el-card
          v-if="item && item.length"
          :key="index"
          class="section-card record-card"
          shadow="never"
        >
          <div slot="header" class="card-header">
            <span class="date-label">{{ index }}</span>
            <span class="card-sub">本地发布记录</span>
          </div>
          <el-table :data="item" border style="width: 100%">
            <el-table-column prop="bt" label="标题" min-width="180" />
            <el-table-column prop="phone" label="发布分组" min-width="120" />
            <el-table-column label="发布进度" min-width="320">
              <template slot-scope="scope">
                <div
                  v-for="(sub, si) in scope.row.showAlltype"
                  :key="si"
                  class="progress-row"
                >
                  <span class="platform-badge" :class="getPlatformBadgeClass(sub.pt)">{{ sub.pt }}</span>
                  <div class="progress-detail">
                    <span class="progress-count"
                      >重发 {{ normalizeCount(sub.republishCount) }} 次</span
                    >
                    <span class="progress-count success"
                      >成功 {{ normalizeCount(sub.publishSuccessCount) }}</span
                    >
                    <span
                      class="progress-count fail"
                      :class="{ 'fail-clickable': hasFailScreenshot(sub) }"
                      :title="
                        hasFailScreenshot(sub)
                          ? '点击查看发布失败时的页面截图'
                          : ''
                      "
                      @click="hasFailScreenshot(sub) && openFailScreenshot(scope.row, sub)"
                      >失败 {{ normalizeCount(sub.publishFailCount) }}</span
                    >
                    <span
                      v-if="normalizeCount(sub.publishAbnormalCount) > 0"
                      class="progress-count fail"
                      :class="{ 'fail-clickable': hasFailScreenshot(sub) }"
                      :title="
                        hasFailScreenshot(sub)
                          ? '点击查看发布异常时的页面截图'
                          : ''
                      "
                      @click="hasFailScreenshot(sub) && openFailScreenshot(scope.row, sub)"
                      >异常
                      {{ normalizeCount(sub.publishAbnormalCount) }}</span
                    >
                    <el-tag
                      size="mini"
                      :type="publishStatusType(sub.publishStatus)"
                      >{{ publishStatusText(sub.publishStatus) }}</el-tag
                    >
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260">
              <template slot-scope="scope">
                <el-button
                  v-if="canGetStatus(scope.row)"
                  type="primary"
                  size="mini"
                  class="mb8"
                  :loading="isStatusLoading(scope.row)"
                  :disabled="isStatusLoading(scope.row)"
                  @click="handleGetStatus(scope.row)"
                >
                  获取状态
                </el-button>
                <el-popconfirm
                  confirm-button-text="删除"
                  cancel-button-text="取消"
                  icon="el-icon-info"
                  icon-color="red"
                  title="确定删除这条记录吗？"
                  @confirm="handleDelete(scope.row, index, scope.$index)"
                >
                  <el-button slot="reference" type="danger" size="mini"
                    >删除</el-button
                  >
                </el-popconfirm>
                <el-button
                  v-if="canRepublish(scope.row)"
                  type="warning"
                  size="mini"
                  class="mb8"
                  @click="handleRepublish(scope.row)"
                >
                  重新发布
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </template>
    </div>

    <!-- 发布失败截图：点记录里的「失败 / 异常」次数打开 -->
    <el-dialog
      title="发布失败截图"
      :visible.sync="screenshotDialogVisible"
      width="72%"
      top="6vh"
      append-to-body
    >
      <div v-loading="screenshotLoading" class="shot-body">
        <div v-if="screenshotPath" class="shot-path">{{
          failScreenshotName(screenshotPath)
        }}</div>
        <img
          v-if="screenshotDataUrl"
          :src="screenshotDataUrl"
          class="shot-img"
          alt="发布失败截图"
        />
        <el-alert
          v-else-if="screenshotError && !screenshotLoading"
          :title="screenshotError"
          type="warning"
          :closable="false"
          show-icon
        />
        <div
          v-else-if="!screenshotLoading"
          class="shot-empty"
        >
          暂无截图
        </div>
      </div>
      <div slot="footer">
        <el-button size="mini" @click="openFailScreenshotExternally"
          >用系统看图打开</el-button
        >
        <el-button type="primary" size="mini" @click="screenshotDialogVisible = false"
          >关闭</el-button
        >
      </div>
    </el-dialog>

    <!-- 旧的 <webview> 登录弹窗已迁移到主进程独立 BrowserWindow -->
  </div>
</template>

<script>
import { ipcRenderer } from "electron";
import dataRequest from "@/utils/dataRequest";
import copyToClipboard from "@/utils/copy";
import ptConfig from "@/utils/configUrl";
import openLoginWindow from "@/utils/openLoginWindow";
import LocalVideoPublish from "@/components/LocalVideoPublish.vue";
import LocalArticlePublish from "@/components/LocalArticlePublish.vue";
import { normalizeVideoRecordMetadata } from "../../../shared/videoMetadata.js";
import { buildPublishHistoryCsv } from "../../../shared/publishHistoryCsv.js";

export default {
  name: "VideoManager",
  components: {
    LocalVideoPublish,
    LocalArticlePublish,
  },
  computed: {
    hasRecords() {
      return (
        this.dataList &&
        Object.keys(this.dataList).some(
          (k) => Array.isArray(this.dataList[k]) && this.dataList[k].length > 0
        )
      );
    },
  },
  data() {
    return {
      // 抖音获取发布状态的class名称
      statusCalss: ".video-card-zQ02ng",
      ptConfig,
      dataList: {},
      exportingHistory: false,
      taskHandlers: new Map(),
      statusLoadingMap: {},
      loginData: {},
      showLoginDialog: false,
      // 发布失败截图弹窗
      screenshotDialogVisible: false,
      screenshotLoading: false,
      screenshotDataUrl: "",
      screenshotError: "",
      screenshotPath: "",
    };
  },
  mounted() {
    this._onPuppeteerDone = (event, data) => {
      const { taskId } = data;
      const handler = this.taskHandlers.get(taskId);
      if (handler) {
        handler(data);
        this.taskHandlers.delete(taskId);
      } else {
        this.syncPublishProgress(data);
      }
    };
    ipcRenderer.on("puppeteerFile-done", this._onPuppeteerDone);
  },
  beforeDestroy() {
    ipcRenderer.removeListener("puppeteerFile-done", this._onPuppeteerDone);
  },
  activated() {
    this.loadRecords();
  },
  methods: {
    getPlatformBadgeClass(pt) {
      if (!pt) return "badge-default";
      if (pt.includes("抖音")) return "badge-douyin";
      if (pt.includes("快手")) return "badge-kuaishou";
      if (pt.includes("哔哩") || pt.includes("B站") || pt.includes("bilibili")) return "badge-bilibili";
      if (pt.includes("视频号") || pt.includes("微信")) return "badge-sph";
      if (pt.includes("小红书")) return "badge-xhs";
      if (pt.includes("头条")) return "badge-tt";
      if (pt.includes("百家")) return "badge-bjh";
      return "badge-default";
    },
    async exportHistory() {
      if (this.exportingHistory) return;
      const { csv, recordCount } = buildPublishHistoryCsv(this.dataList);
      if (!recordCount) {
        this.$message.info("当前没有可导出的发布记录");
        return;
      }
      this.exportingHistory = true;
      try {
        const result = await ipcRenderer.invoke("publish:export-history", { csv });
        if (result && result.ok) {
          this.$message.success(`已导出 ${recordCount} 条平台发布记录`);
        } else if (!result || !result.canceled) {
          this.$message.error((result && result.message) || "导出失败");
        }
      } catch (error) {
        this.$message.error("导出失败：" + error.message);
      } finally {
        this.exportingHistory = false;
      }
    },
    copy: copyToClipboard,
    getStatusRowKey(row) {
      if (!row) return "";
      return [
        row.textOtherName || "",
        String(row.phone || "").split("-")[0],
        row.selectedFile || "",
      ].join("-");
    },
    isStatusLoading(row) {
      const key = this.getStatusRowKey(row);
      return !!this.statusLoadingMap[key];
    },
    async handleGetStatus(row) {
      if (!this.canGetStatus(row) || this.isStatusLoading(row)) return;
      const isJuejinArticle = (item) =>
        item && item.textType === "article" && item.pt === "掘金";
      // 只处理还没有拿到作品链接的记录：拉取该平台作品列表，按标题匹配命中即发布成功
      const targets = (row.showAlltype || []).filter(
        (item) =>
          item &&
          !item.videoLink &&
          (item.textType !== "article" || isJuejinArticle(item))
      );
      if (!targets.length) {
        this.$message.info("没有需要获取状态的记录");
        return;
      }
      const key = this.getStatusRowKey(row);
      this.$set(this.statusLoadingMap, key, true);
      try {
        const tasks = targets.map((item, idx) => ({
          key: String(idx),
          group: String(item.phone || "").split("-")[0],
          platform: item.pt,
          partition:
            "persist:" + String(item.phone || "").split("-")[0] + item.pt,
          title: item.title || item.bt || item.textOtherName || "",
        }));
        const res = await ipcRenderer.invoke("stats:match-works", { tasks });
        const matches = (res && res.matches) || {};
        let okCount = 0;
        for (const [idx, m] of Object.entries(matches)) {
          if (!m || !m.found) continue;
          const item = targets[Number(idx)];
          if (!item) continue;
          const payload = JSON.parse(JSON.stringify(item));
          delete payload.showAlltype;
          // 视频号等平台无法构造作品直链时，用作品管理页兜底（与掘金逻辑一致）
          const fallbackUrl =
            this.ptConfig[item.pt] && this.ptConfig[item.pt].listIndex
              ? this.ptConfig[item.pt].listIndex
              : "";
          await dataRequest({
            type: "update",
            fileName: "pushData",
            item: {
              ...payload,
              status: true,
              videoLink: m.url || fallbackUrl,
            },
          });
          okCount++;
        }
        const failCount = targets.length - okCount;
        const errors = (res && res.errors) || [];
        if (okCount > 0 && failCount === 0) {
          this.$message.success(`全部 ${okCount} 条记录已确认发布成功`);
        } else if (okCount > 0) {
          this.$message.warning(
            `${okCount} 条已确认发布成功，${failCount} 条未在作品列表中找到`
          );
        } else if (errors.length) {
          this.$message.error(
            "获取失败：" +
              errors.map((e) => `${e.group}·${e.platform} ${e.error}`).join("；")
          );
        } else {
          this.$message.warning(
            "作品列表中未找到对应视频，可能尚未发布成功或被平台删除"
          );
        }
        // 刷新发布记录
        const r = await dataRequest({ type: "get", fileName: "pushData" });
        this.initDataFiltered(r.data || {});
      } catch (err) {
        this.$message.error(
          "获取状态失败：" + (err && err.message ? err.message : err)
        );
      } finally {
        this.$set(this.statusLoadingMap, key, false);
      }
    },
    canGetStatus(row) {
      if (!row) return false;
      if (row.textType !== "article") return true;
      return (row.showAlltype || [row]).some(
        (item) => item && item.textType === "article" && item.pt === "掘金"
      );
    },
    normalizeCount(v) {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    },
    // ── 发布失败截图 ────────────────────────────────────────────
    // 主进程在平台 handler 失败、或「发布会话疑似没发出去」时截图，
    // 文件名随 donePayload.failScreenshot 返回。这里只负责落库 + 展示。
    pickFailScreenshot(payload, row) {
      const shot = payload && payload.failScreenshot;
      if (shot) return String(shot);
      return String((row && row.failScreenshot) || "");
    },
    hasFailScreenshot(row) {
      return !!this.getFailScreenshot(row);
    },
    /** 详情里的截图路径可能是「本子记录」或某个平台子记录，取第一个存在的 */
    getFailScreenshot(row) {
      if (!row) return "";
      if (row.failScreenshot) return String(row.failScreenshot);
      const hit = (row.showAlltype || row.details || []).find(
        (item) => item && item.failScreenshot
      );
      return hit ? String(hit.failScreenshot) : "";
    },
    failScreenshotName(filePath) {
      const segments = String(filePath || "").split(/[\\/]/);
      return segments[segments.length - 1] || "";
    },
    async openFailScreenshot(row, sub) {
      const filePath = this.getFailScreenshot(sub || row);
      if (!filePath) return;
      this.screenshotLoading = true;
      this.screenshotDialogVisible = true;
      this.screenshotPath = filePath;
      this.screenshotDataUrl = "";
      this.screenshotError = "";
      try {
        const result = await ipcRenderer.invoke(
          "publish:readFailScreenshot",
          filePath
        );
        if (result && result.ok) {
          this.screenshotDataUrl = result.dataUrl;
        } else {
          this.screenshotError =
            (result && result.message) || "读取失败截图失败";
        }
      } catch (e) {
        this.screenshotError = (e && e.message) || "读取失败截图失败";
      } finally {
        this.screenshotLoading = false;
      }
    },
    async openFailScreenshotExternally() {
      if (!this.screenshotPath) return;
      try {
        const ok = await ipcRenderer.invoke(
          "publish:openFailScreenshot",
          this.screenshotPath
        );
        if (!ok) this.$message.warning("截图文件不存在或已被自动清理");
      } catch (e) {
        this.$message.error("打开截图失败：" + ((e && e.message) || e));
      }
    },
    publishStatusType(status) {
      if (status === "success") return "success";
      if (
        status === "fail" ||
        status === "failed" ||
        status === "expired" ||
        status === "abnormal"
      )
        return "danger";
      if (status === "scheduled" || status === "skipped") return "info";
      if (status === "draft") return "info";
      return "warning";
    },
    publishStatusText(status) {
      if (status === "success") return "成功";
      if (status === "fail" || status === "failed") return "失败";
      if (status === "abnormal") return "发布异常";
      if (status === "scheduled") return "等待定时发布";
      if (status === "skipped") return "已跳过";
      if (status === "expired") return "任务过期";
      if (status === "draft") return "已保存草稿";
      if (status === "drafting") return "保存草稿中";
      return "发布中";
    },
    isPublishFailed(row) {
      if (!row) return false;
      if (
        ["fail", "failed", "expired", "abnormal"].includes(
          String(row.publishStatus || "")
        )
      )
        return true;
      if (
        Number(row.publishFailCount) > 0 &&
        Number(row.publishSuccessCount) === 0
      )
        return true;
      if (String(row.lastPublishMessage || "").includes("失败")) return true;
      if (String(row.lastPublishMessage || "").includes("过期")) return true;
      return false;
    },
    canRepublish(row) {
      return row && (row.textType === "local" || row.textType === "article");
    },
    async handleRepublish(row) {
      const details = (row && row.showAlltype) || [];
      if (!details.length) {
        this.$message.warning("当前记录没有可重发的平台");
        return;
      }
      if (row.textType === "article") {
        const sample = details[0] || {};
        const failedTargets = details.filter(this.isPublishFailed).map((v) => ({
          pt: v.pt,
          phone: String(v.phone || "").split("-")[0],
        }));
        const ok = this.$refs.articlePublishRef.openRepublish({
          sample,
          records: details.map((v) => ({
            id: v.id,
            date: v.date,
            pt: v.pt,
            phone: String(v.phone || "").split("-")[0],
            publishAttemptCount: Number(v.publishAttemptCount) || 1,
            republishCount: Number(v.republishCount),
          })),
          failedTargets,
        });
        if (!ok) return;
        if (failedTargets.length === 0) {
          this.$message.info(
            "未检测到失败平台，已打开发布弹窗，请手动勾选需要重发的平台。"
          );
        }
        return;
      }
      let filePath = details.map((v) => v && v.filePath).find(Boolean);
      const remoteFileUrl = details
        .map((v) => v && v.remoteFileUrl)
        .find(Boolean);
      const localFileExists =
        filePath && (await ipcRenderer.invoke("fs:existsSync", filePath));
      if (!filePath || (!localFileExists && !remoteFileUrl)) {
        if (!localFileExists && filePath) {
          this.$message.info("本地视频文件已不存在，请重新选择视频文件。");
        } else {
          this.$message.info("历史记录缺少视频路径，请先重新选择视频文件。");
        }
        filePath = await ipcRenderer.invoke("dialog:openVideoFile");
        if (!filePath) {
          this.$message.warning("未选择视频文件，已取消重发。");
          return;
        }
      } else if (!localFileExists && remoteFileUrl) {
        // 本地文件已删除但有远程 URL，先下载到本地再重发
        try {
          await this.$confirm(
            "本地视频文件已清理，是否从远程地址重新下载？",
            "重新发布",
            {
              confirmButtonText: "重新下载",
              cancelButtonText: "手动选择文件",
              distinguishCancelAndClose: true,
              type: "warning",
            }
          );
          const loading = this.$loading({
            lock: true,
            text: "正在下载远程视频…",
            background: "rgba(0, 0, 0, 0.7)",
          });
          try {
            filePath = await ipcRenderer.invoke(
              "publish:downloadRemoteFile",
              remoteFileUrl
            );
            this.$message.success("远程视频下载完成");
          } catch (dlErr) {
            this.$message.error(
              "远程视频下载失败: " + (dlErr.message || dlErr)
            );
            return;
          } finally {
            loading.close();
          }
        } catch (action) {
          if (action === "close") {
            this.$message.info("已取消重发。");
            return;
          }
          // 用户选择手动选择文件
          filePath = await ipcRenderer.invoke("dialog:openVideoFile");
          if (!filePath) {
            this.$message.warning("未选择视频文件，已取消重发。");
            return;
          }
        }
      } else {
        let shouldChooseNewVideo = false;
        try {
          await this.$confirm("是否重新选择视频文件后再重发？", "重新发布", {
            confirmButtonText: "重新选择视频",
            cancelButtonText: "沿用原视频",
            distinguishCancelAndClose: true,
            type: "warning",
          });
          shouldChooseNewVideo = true;
        } catch (action) {
          if (action === "close") {
            this.$message.info("已取消重发。");
            return;
          }
        }
        if (shouldChooseNewVideo) {
          const selectedPath = await ipcRenderer.invoke("dialog:openVideoFile");
          if (!selectedPath) {
            this.$message.warning("未选择视频文件，已取消重发。");
            return;
          }
          filePath = selectedPath;
        }
      }

      const sample = details[0] || {};
      const normalizedDetails = details.map((record) => ({
        record,
        metadata: normalizeVideoRecordMetadata(record),
      }));
      const description =
        normalizedDetails
          .map((item) => item.metadata.description)
          .find(Boolean) || "";
      const shortTitle =
        normalizedDetails
          .filter((item) => item.record.pt === "视频号")
          .map((item) => item.metadata.shortTitle)
          .find(Boolean) || "";
      const failedTargets = details.filter(this.isPublishFailed).map((v) => ({
        pt: v.pt,
        phone: String(v.phone || "").split("-")[0],
      }));

      const ok = this.$refs.localPublishRef.openRepublish({
        filePath,
        textOtherName: sample.textOtherName || "",
        form: {
          title: sample.bookName || sample.textOtherName || "",
          bt1: sample.bt || "",
          description,
          shortTitle,
          tags: sample.tags || sample.bq || "",
          bq: sample.bq || "",
          coverPath: sample.coverPath || "",
          creativeStatement: sample.creativeStatement,
        },
        records: normalizedDetails.map(({ record, metadata }) => ({
          id: record.id,
          date: record.date,
          pt: record.pt,
          phone: String(record.phone || "").split("-")[0],
          description: metadata.description,
          shortTitle: metadata.shortTitle,
          tags: metadata.tags,
          publishAttemptCount: Number(record.publishAttemptCount) || 1,
          republishCount: Number(record.republishCount),
        })),
        failedTargets,
      });
      if (!ok) return;
      if (failedTargets.length === 0) {
        this.$message.info(
          "未检测到失败平台，已打开发布弹窗，请手动勾选需要重发的平台。"
        );
      }
    },
    getFileName(filePath) {
      if (!filePath) return "";
      const s = String(filePath).replace(/\\/g, "/");
      const arr = s.split("/");
      return arr[arr.length - 1] || "";
    },
    fillPublishStats(row) {
      const copyRow = { ...row };
      const attemptCount = Number(copyRow.publishAttemptCount) || 1;
      copyRow.publishAttemptCount = attemptCount;
      copyRow.republishCount = Number(copyRow.republishCount);
      if (
        !Number.isFinite(copyRow.republishCount) ||
        copyRow.republishCount < 0
      ) {
        copyRow.republishCount = Math.max(0, attemptCount - 1);
      }
      copyRow.publishSuccessCount = this.normalizeCount(
        copyRow.publishSuccessCount
      );
      copyRow.publishFailCount = this.normalizeCount(copyRow.publishFailCount);
      copyRow.publishAbnormalCount = this.normalizeCount(
        copyRow.publishAbnormalCount
      );
      copyRow.publishStatus = copyRow.publishStatus || "publishing";
      return copyRow;
    },
    recordValue(value) {
      return String(value || "");
    },
    getRecordPhone(row) {
      return String((row && row.phone) || "").split("-")[0];
    },
    getArticleField(row, key) {
      if (!row) return "";
      if (row[key] !== undefined && row[key] !== null)
        return this.recordValue(row[key]);
      const data = row.data || {};
      return this.recordValue(data[key]);
    },
    getArticleTags(row) {
      if (!row) return "";
      const data = row.data || {};
      return this.recordValue(row.bq || row.tags || data.bq || data.tags);
    },
    buildArticleMergeKey(row) {
      return [
        this.recordValue(row && row.textOtherName),
        this.recordValue(row && row.textType),
        this.getRecordPhone(row),
        this.recordValue(row && row.partition),
        this.recordValue(row && row.selectedFile),
        this.getArticleField(row, "content"),
        this.getArticleField(row, "articleFilePath"),
        this.getArticleField(row, "coverPath"),
        this.getArticleField(row, "category"),
        this.getArticleTags(row),
        this.getArticleField(row, "summary"),
      ].join("\u0001");
    },
    isSameArticlePublishRecord(record, target) {
      return (
        this.buildArticleMergeKey(record) === this.buildArticleMergeKey(target)
      );
    },
    findLocalPublishRecord(donePayload) {
      const textType = donePayload.textType || "local";
      const textOtherName =
        donePayload.textOtherName ||
        (donePayload.data && donePayload.data.textOtherName) ||
        "";
      const selectedFile =
        donePayload.selectedFile || this.getFileName(donePayload.filePath);
      const pt = donePayload.pt;
      const phone = String(donePayload.phone || "").split("-")[0];
      const dateKeys = Object.keys(this.dataList || {});
      for (const dateKey of dateKeys) {
        const dayRows = this.dataList[dateKey] || [];
        for (const row of dayRows) {
          const details = row.showAlltype || [];
          for (const sub of details) {
            const subPhone = String(sub.phone || "").split("-")[0];
            if (textType === "article") {
              if (
                sub.textType === "article" &&
                sub.pt === pt &&
                this.isSameArticlePublishRecord(sub, donePayload)
              ) {
                return { date: dateKey, row: sub };
              }
              continue;
            }
            if (
              sub.textType === textType &&
              sub.pt === pt &&
              sub.textOtherName === textOtherName &&
              sub.selectedFile === selectedFile &&
              subPhone === phone
            ) {
              return { date: dateKey, row: sub };
            }
          }
        }
      }
      return null;
    },
    async syncPublishProgress(donePayload) {
      if (!donePayload || !["local", "article"].includes(donePayload.textType))
        return;
      if (donePayload.interrupted) return;
      if (
        !donePayload.pt ||
        String(donePayload.pt).includes("状态") ||
        String(donePayload.pt).includes("登录")
      )
        return;
      const target = this.findLocalPublishRecord(donePayload);
      if (!target || !target.row || !target.row.id) return;
      const row = this.fillPublishStats(target.row);
      if (donePayload.skipped) {
        await dataRequest({
          type: "update",
          fileName: "pushData",
          item: {
            id: row.id,
            date: target.date,
            publishStatus: "skipped",
            lastPublishMessage:
              donePayload.message || "用户关闭窗口，已跳过发布",
            lastPublishAt: Date.now(),
          },
        });
        this.loadRecords();
        return;
      }
      const success = !!donePayload.status;
      const isDraftMode =
        donePayload.publishMode === "draft" ||
        donePayload.publishToDraft === true;
      // 发布成功后平台会自动跳成功页；5 秒后地址没变说明疑似没发出去，
      // 主进程用 publishAbnormal 标记，这里单独记为「发布异常」而不是成功。
      const abnormal = success && donePayload.publishAbnormal === true;
      // 主进程在失败/异常瞬间截了发布页的图，这里存进记录，之后可以直接回看
      const failScreenshot = this.pickFailScreenshot(donePayload, row);
      if (abnormal) {
        await dataRequest({
          type: "update",
          fileName: "pushData",
          item: {
            id: row.id,
            date: target.date,
            publishAbnormalCount:
              this.normalizeCount(row.publishAbnormalCount) + 1,
            publishStatus: "abnormal",
            ...(failScreenshot ? { failScreenshot } : {}),
            lastPublishMessage:
              donePayload.message ||
              "发布异常：点击发布后 5 秒页面地址未变化，请到平台确认",
            lastPublishAt: Date.now(),
          },
        });
        this.$notify({
          title: "发布异常",
          message:
            donePayload.message ||
            `${donePayload.pt || ""} 发布后页面未跳转，请到平台确认是否已发布`,
          type: "error",
          duration: 0,
        });
        this.loadRecords();
        return;
      }
      await dataRequest({
        type: "update",
        fileName: "pushData",
        item: {
          id: row.id,
          date: target.date,
          publishSuccessCount: success
            ? row.publishSuccessCount + 1
            : row.publishSuccessCount,
          publishFailCount: success
            ? row.publishFailCount
            : row.publishFailCount + 1,
          publishMode: isDraftMode ? "draft" : row.publishMode || "publish",
          publishStatus: success
            ? isDraftMode
              ? "draft"
              : "success"
            : "failed",
          // 成功/存草稿时清掉旧截图，避免把上一次失败的画面留在成功记录上
          failScreenshot: success ? "" : failScreenshot,
          lastPublishMessage:
            donePayload.message ||
            (success
              ? isDraftMode
                ? "保存草稿成功"
                : "发布成功"
              : "发布失败"),
          lastPublishAt: Date.now(),
        },
      });
      if (donePayload.needsAttention) {
        this.$notify({
          title: "发布任务需要处理",
          message: donePayload.message || "任务已转为草稿，请前往平台检查",
          type: "warning",
          duration: 0,
        });
      }
      this.loadRecords();
    },
    async selectVideoFile() {
      const path = await ipcRenderer.invoke("dialog:openVideoFile");
      if (path) {
        this.$refs.localPublishRef.open(path);
      }
    },
    async openDirectoryPublish() {
      this.$refs.localPublishRef.openDirectory();
    },
    openArticlePublish() {
      this.$refs.articlePublishRef.open();
    },

    loadRecords() {
      dataRequest({
        type: "get",
        fileName: "pushData",
      }).then((r) => {
        this.initDataFiltered(r.data || {});
      });
    },

    initDataFiltered(data) {
      const tempObj = {};
      this.dataList = {};
      for (const key in data) {
        const tempData = {};
        const list = data[key] || [];
        list.forEach((row) => {
          if (!["local", "article"].includes(row.textType)) return;
          const mergeKey =
            row.textType === "article"
              ? this.buildArticleMergeKey(row)
              : row.textOtherName +
                "-" +
                row.textType +
                this.getRecordPhone(row) +
                row.selectedFile;
          if (!tempData[mergeKey]) {
            const copyRow = this.fillPublishStats(
              JSON.parse(JSON.stringify(row))
            );
            copyRow.showAlltype = [
              this.fillPublishStats(JSON.parse(JSON.stringify(row))),
            ];
            tempData[mergeKey] = copyRow;
          } else {
            tempData[mergeKey].showAlltype.push(
              this.fillPublishStats(JSON.parse(JSON.stringify(row)))
            );
          }
        });
        if (Object.keys(tempData).length) {
          tempObj[key] = tempData;
        }
      }
      for (const key in tempObj) {
        const v = Object.values(tempObj[key]).reverse();
        this.$set(this.dataList, key, v);
      }
    },

    async opPt(item) {
      try {
        const result = await openLoginWindow(item);
        if (result && result.ok === false) {
          this.$message.error(result.message || "打开登录窗口失败");
        } else if (result && result.reused) {
          this.$message.info("已切换到已打开的登录窗口");
        }
      } catch (e) {
        this.$message.error(
          "打开登录窗口失败：" + (e && e.message ? e.message : e)
        );
      }
    },

    handleDelete(item, dateKey, idx) {
      const promises = item.showAlltype.map((v) =>
        dataRequest({
          type: "delete",
          fileName: "pushData",
          item: {
            id: v.id,
            date: dateKey,
          },
        })
      );
      Promise.all(promises).then(() => {
        this.dataList[dateKey].splice(idx, 1);
        if (this.dataList[dateKey].length === 0) {
          this.$delete(this.dataList, dateKey);
        }
      });
    },
  },
};
</script>

<style lang="scss" scoped>
@import "@/styles/variables.scss";

.toolbar {
  margin-bottom: 20px;
  padding: 18px 22px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
}

.toolbar-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.btn-svg-icon {
  font-size: 15px;
  margin-right: 6px;
  vertical-align: -2px;
}

.action-btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  .btn-svg-icon {
    font-size: 16px;
  }

  &:hover {
    transform: translateY(-1.5px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.38);
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  }

  &:active {
    transform: translateY(0);
  }
}

.action-btn-secondary {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.2s;

  &:hover {
    border-color: #3b82f6;
    color: #2563eb;
    background: #f8fafc;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
  }
}

.action-btn-article {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #16a34a;
  box-shadow: 0 1px 3px rgba(22, 163, 74, 0.06);
  transition: all 0.2s;

  &:hover {
    border-color: #86efac;
    color: #15803d;
    background: #dcfce7;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(22, 163, 74, 0.12);
  }
}

.action-btn-export {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  transition: all 0.2s;

  &:hover {
    color: #0f172a;
    border-color: #cbd5e1;
    background: #ffffff;
  }
}

.empty-records-card {
  padding: 48px 24px;
  text-align: center;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  margin: 10px 0 24px;

  .empty-icon-wrap {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    border-radius: 16px;
    background: #eff6ff;
    display: flex;
    align-items: center;
    justify-content: center;

    .empty-svg-icon {
      font-size: 32px;
      color: #3b82f6;
    }
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 8px;
  }

  .empty-desc {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 20px;
  }

  .empty-action-btn {
    border-radius: 8px;
    font-weight: 500;
    padding: 8px 18px;
  }
}

.platform-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  line-height: 1.4;
  margin-right: 8px;
}

.badge-douyin {
  background: #18181b;
  color: #38bdf8;
  border: 1px solid #27272a;
}
.badge-kuaishou {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid #fed7aa;
}
.badge-bilibili {
  background: #f0f9ff;
  color: #0284c7;
  border: 1px solid #bae6fd;
}
.badge-sph {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.badge-xhs {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}
.badge-tt {
  background: #fff1f2;
  color: #e11d48;
  border: 1px solid #ffe4e6;
}
.badge-bjh {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}
.badge-default {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

.toolbar-label {
  font-size: 13px;
  color: #909399;
  margin-right: 4px;
}

.info-box {
  min-height: 120px;
}

.record-card {
  ::v-deep .el-card__body {
    padding-top: 0;
  }
}

.mb8 {
  margin-bottom: 8px;
}

.date-label {
  color: #303133;
  font-weight: 600;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.progress-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 300px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.progress-count {
  font-size: 12px;
  color: #666;
}

.progress-count.success {
  color: #2e8b57;
}

.progress-count.fail {
  cursor: default;
}

/* 有失败截图的记录：次数可点，提示用户能回看当时的页面 */
.progress-count.fail-clickable {
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.progress-count.fail-clickable:hover {
  color: #f56c6c;
}

.shot-body {
  min-height: 200px;
  max-height: 68vh;
  overflow: auto;
  text-align: center;
}

.shot-path {
  margin-bottom: 8px;
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}

.shot-img {
  max-width: 100%;
  border: 1px solid $borderColor;
  border-radius: 4px;
}

.shot-empty {
  padding: 40px 0;
  color: #909399;
  font-size: 13px;
}

.pt-name {
  cursor: pointer;
  width: 60%;
  word-break: break-all;
}

.fail {
  color: #c00;
  cursor: pointer;
}
</style>
