# 自助导入网站数据

`imports/data/` 中的 CSV 文件就是网站内容模板，可以直接使用 Excel、WPS 或文本编辑器修改。

## 文件用途

- `settings.csv`：品牌名、首页文案、关于我们、联系方式和地址
- `stats.csv`：首页统计数字
- `products.csv`：产品平台
- `solutions.csv`：行业解决方案
- `insights.csv`：新闻与技术文章

所有文件必须保存为 **UTF-8 CSV**。如果内容中包含逗号或换行，请让 Excel/WPS 自动加双引号，或手动使用英文双引号包裹整个单元格。

## 导入步骤

1. 修改 `imports/data/` 中的 CSV 文件。
2. 只校验、不写入：

   ```powershell
   npm run import:check
   ```

3. 校验通过后替换网站内容：

   ```powershell
   npm run import:data
   ```

4. 启动或重启网站：

   ```powershell
   npm start
   ```

导入会替换 `settings`、`stats`、`products`、`solutions` 和 `insights` 的内容，但不会删除 `inquiries` 中已经收到的询盘。

## 字段说明

### products.csv

- `category`：程序使用的分类标识，建议只使用小写英文字母和短横线
- `category_label`：页面显示的分类文字
- `code`：产品唯一编号，不允许重复
- `theme`：卡片配色，可选 `red`、`blue`、`mint`、`gold`
- `image_url`：产品图片地址；站内图片建议填写 `/assets/products/文件名.webp`，留空时显示默认 CSS 视觉
- `description`：产品详情页的完整介绍
- `features`：产品特点，多个项目使用 `|` 分隔
- `applications`：应用领域，多个项目使用 `|` 分隔
- `substrates`：适用基材，多个项目使用 `|` 分隔
- `performance`：性能重点，多个项目使用 `|` 分隔
- `process`：施工或固化流程，多个步骤使用 `|` 分隔
- `package_info`：包装、供货或储存说明
- `document_url`：技术资料下载地址，留空时显示“联系技术团队获取”
- `position`：排序数字，越小越靠前
- `is_published`：`1` 显示，`0` 隐藏

### insights.csv

- `published_at`：必须使用 `YYYY-MM-DD`
- `is_featured`：首页精选文章，只允许一条已发布内容为 `1`
- `is_published`：`1` 显示，`0` 隐藏

### settings.csv

设置项的 `key` 不要修改，只需要替换 `value`。地址需要换行时，在单元格中写 `\n`。
