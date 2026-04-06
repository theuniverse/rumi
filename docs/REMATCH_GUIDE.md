# Rematch功能使用指南

## 功能概述

Rematch功能用于将Scraper提取的活动中的艺术家名称(字符串)匹配到RefData中的艺术家ID。这是Events推荐系统正常工作的关键步骤。

## 为什么需要Rematch?

### 问题场景
1. Scraper从微信公众号等来源提取活动信息
2. 提取的lineup包含艺术家名称字符串,如`["Fat-K", "Elisa Bee"]`
3. RefData中有艺术家记录,如`{id: 1, name: "Fat-K"}`
4. 但两者之间没有关联

### Rematch的作用
- 自动将字符串名称匹配到RefData ID
- 创建`EventEntityMatch`记录
- 使Events推荐API能够查询到相关活动

## 使用方法

### 方法1: UI批量Rematch (推荐)

1. **进入Scraper Events页面**
   - 导航到 `Scraper → Events`

2. **可选:过滤活动**
   - 使用status下拉菜单选择要处理的活动类型
   - `complete` - 完整提取的活动(推荐)
   - `partial` - 部分提取的活动
   - `tba` - 待确认的活动

3. **点击Rematch All按钮**
   - 位于页面右上角
   - 图标: 🔄 RefreshCw

4. **确认操作**
   - 弹出确认对话框
   - 点击"确定"开始处理

5. **等待完成**
   - 按钮显示"Rematching..."
   - 图标旋转动画
   - 处理时间取决于活动数量

6. **查看结果**
   - 弹窗显示统计信息:
     - `Matched: X/Y events` - 成功匹配的活动数
     - `Errors: Z` - 失败的活动数
   - 页面自动刷新显示更新后的数据

### 方法2: API单个Rematch

适用于调试或处理特定活动。

```bash
# Rematch event_id=18的活动
curl -X POST http://localhost:9000/api/refdata/rematch-event/18

# 响应示例
{
  "status": "success",
  "event_id": 18,
  "matches_count": 6,
  "matches": [
    {
      "entity_type": "artist",
      "entity_id": 1,
      "raw_name": "Fat-K",
      "confidence": 1.0
    },
    {
      "entity_type": "artist",
      "entity_id": 9,
      "raw_name": "Elisa Bee",
      "confidence": 1.0
    },
    ...
  ]
}
```

### 方法3: API批量Rematch

适用于自动化脚本或大批量处理。

```bash
# Rematch所有complete状态的活动,最多100个
curl -X POST "http://localhost:9000/api/refdata/rematch-all-events?status_filter=complete&limit=100"

# 响应示例
{
  "status": "success",
  "total_events": 50,
  "matched_count": 48,
  "errors": [
    {
      "event_id": 25,
      "error": "No timetable slots found"
    },
    {
      "event_id": 30,
      "error": "Venue not found"
    }
  ]
}
```

## 匹配算法

### 匹配流程
1. **读取Timetable**: 从`timetable_slots.artists_json`获取艺术家名称
2. **名称标准化**:
   - 转小写
   - 去除"DJ"、"MC"等前缀
   - 去除多余空格
3. **精确匹配**: 在RefArtist的name和aliases中查找
4. **模糊匹配**: 使用Levenshtein距离(阈值=2)
5. **创建记录**: 在`event_entity_matches`表中创建关联

### 置信度评分
- `1.0` - 精确匹配(名称或别名完全相同)
- `0.8-0.9` - 模糊匹配(Levenshtein距离=1)
- `0.6-0.7` - 较远匹配(Levenshtein距离=2)

### 同名消歧义
当前版本使用第一个匹配的艺术家。未来版本将考虑:
- 城市匹配
- 场馆历史
- 风格相似度
- 同场其他艺术家

## 验证Rematch结果

### 1. 检查EventEntityMatch表

```sql
-- 查看某个活动的所有匹配
SELECT
  eem.*,
  ra.name as artist_name,
  rv.name as venue_name
FROM event_entity_matches eem
LEFT JOIN ref_artists ra ON eem.entity_type = 'artist' AND eem.entity_id = ra.id
LEFT JOIN ref_venues rv ON eem.entity_type = 'venue' AND eem.entity_id = rv.id
WHERE eem.event_id = 18;
```

### 2. 测试Events推荐API

```bash
# 假设Fat-K的ID是1
curl "http://localhost:5173/rumi/scraper-api/refdata/events-by-artists?artist_ids=1&limit=100"

# 应该返回包含Fat-K的所有活动
```

### 3. 检查Rumi Events页面

1. 在Rumi People页面关注Fat-K
2. 将Fat-K关联到Scraper RefArtist (ID=1)
3. 进入Rumi Events页面
4. 切换到"Recommended"标签
5. 应该看到包含Fat-K的活动推荐

## 常见问题

### Q: Rematch后仍然没有推荐?
**A:** 检查以下几点:
1. 是否在Rumi People页面关注了艺术家?
2. 是否将Rumi Person关联到了Scraper RefArtist?
3. RefArtist是否在RefData中存在?
4. EventEntityMatch是否创建成功?

### Q: 匹配到了错误的艺术家?
**A:** 当前版本暂不支持手动更正,未来版本将添加:
- 手动更正UI
- 基于上下文的智能消歧义
- 学习系统

### Q: 某些艺术家总是匹配失败?
**A:** 可能原因:
1. RefData中不存在该艺术家 → 需要先添加到RefArtist
2. 名称差异太大 → 添加别名(aliases)到RefArtist
3. 特殊字符问题 → 检查名称标准化逻辑

### Q: Rematch会影响已有的匹配吗?
**A:** 是的,Rematch会:
1. 删除该活动的所有旧匹配记录
2. 重新运行匹配算法
3. 创建新的匹配记录

### Q: 多久需要Rematch一次?
**A:** 在以下情况需要Rematch:
- 添加新的RefArtist或RefVenue后
- 更新RefArtist的aliases后
- 发现匹配错误需要修正时
- 新提取的活动需要匹配时

## 最佳实践

1. **定期维护RefData**
   - 及时添加新艺术家和场馆
   - 为常见变体添加aliases
   - 保持数据准确性

2. **分批处理**
   - 使用status过滤器分批Rematch
   - 先处理complete状态的活动
   - 避免一次处理过多活动

3. **验证结果**
   - Rematch后检查匹配数量
   - 抽查几个活动的匹配结果
   - 测试Events推荐是否正常

4. **监控错误**
   - 注意Rematch结果中的errors
   - 分析失败原因
   - 改进RefData或匹配算法

## 技术细节

### 数据库表结构

```sql
-- EventEntityMatch表
CREATE TABLE event_entity_matches (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,  -- 'artist', 'venue', 'label'
    entity_id INTEGER NOT NULL,
    raw_name TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API端点

- `POST /refdata/rematch-event/{event_id}` - 单个活动
- `POST /refdata/rematch-all-events` - 批量活动
  - 参数: `status_filter` (可选)
  - 参数: `limit` (默认100,最大500)

### 前端API

```typescript
// 单个Rematch
await scraperApi.rematchEvent(eventId);

// 批量Rematch
await scraperApi.rematchAllEvents({
  status_filter: 'complete',
  limit: 100
});
```

## 相关文档

- [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md) - Events功能完整指南
- [MATCHER_IMPROVEMENTS.md](MATCHER_IMPROVEMENTS.md) - Matcher改进计划
- [EVENTS_INTEGRATION_PLAN.md](EVENTS_INTEGRATION_PLAN.md) - 技术实现方案
