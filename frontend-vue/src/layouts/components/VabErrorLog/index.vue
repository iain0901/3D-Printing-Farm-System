<template>
  <div v-if="errorLogs.length > 0">
    <el-badge
      :value="errorLogs.length"
      @click="dialogTableVisible = true"
    >
      <el-button type="danger">
        <vab-icon :icon="['fas', 'bug']" />
      </el-button>
    </el-badge>

    <el-dialog
      v-model="dialogTableVisible"
      append-to-body
      title="vue-admin-better 異常擷取（提示：錯誤必須處理）"
      width="70%"
    >
      <el-table :data="errorLogs">
        <el-table-column label="發生錯誤的路由">
          <template #default="{ row }">
            <a :href="row.url" target="_blank">
              <el-tag type="success">{{ row.url }}</el-tag>
            </a>
          </template>
        </el-table-column>
        <el-table-column label="錯誤訊息">
          <template #default="{ row }">
            <el-tag type="danger">{{ decodeUnicode(row.err.message) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="錯誤詳情" width="120">
          <template #default="scope">
            <el-popover placement="top-start" trigger="hover">
              <div style="color: red">
                {{ scope.row.err.stack }}
              </div>
              <template #reference><el-button>查看</el-button></template>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="380">
          <template #default="{ row }">
            <a
              v-for="(item, index) in searchList"
              :key="index"
              :href="item.url + decodeUnicode(row.err.message)"
              target="_blank"
            >
              <el-button style="margin-left: 5px" type="primary">
                <vab-icon :icon="['fas', 'search']" />
                {{ item.title }}
              </el-button>
            </a>
          </template>
        </el-table-column>
      </el-table>
      <template #footer><span class="dialog-footer">
        <el-button @click="dialogTableVisible = false">取 消</el-button>
        <el-button icon="Delete" type="danger" @click="clearAll">
          暫不顯示
        </el-button>
      </span></template>
    </el-dialog>
  </div>
</template>

<script>
  import { abbreviation, title } from '@/config'
  import { mapGetters } from 'vuex'

  export default {
    name: 'VabErrorLog',

    data() {
      return {
        dialogTableVisible: false,
        title: title,
        abbreviation: abbreviation,
        searchList: [
          {
            title: '百度搜尋',
            url: 'https://www.baidu.com/baidu?wd=',
          },
          {
            title: 'Google 搜尋',
            url: 'https://www.google.com/search?q=',
          },
          {
            title: 'Magi 搜尋',
            url: 'https://magi.com/search?q=',
          },
        ],
      }
    },

    computed: {
      ...mapGetters({
        errorLogs: 'errorLog/errorLogs',
      }),
    },
    methods: {
      clearAll() {
        this.dialogTableVisible = false
        this.$store.dispatch('errorLog/clearErrorLog')
      },
      decodeUnicode(str) {
        str = str.replace(/\\/g, '%')
        str = unescape(str)
        str = str.replace(/%/g, '\\')
        str = str.replace(/\\/g, '')
        return str
      },
    },
  }
</script>

<style lang="scss" scoped>
  ::v-deep {
    .el-badge {
      .el-button {
        display: flex;
        align-items: center;
        justify-items: center;
        height: 28px;
      }
    }
  }
</style>
