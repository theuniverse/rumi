# Matcher服务改进计划

## 当前状态

### 已实现功能
- ✅ 基础名称标准化(小写、去前缀、去空格)
- ✅ 精确匹配(name和aliases)
- ✅ 模糊匹配(Levenshtein距离≤2)
- ✅ 置信度评分(1.0/0.8-0.9/0.6-0.7)
- ✅ 手动Rematch功能(UI + API)
- ✅ 批量Rematch支持

### 当前限制
- ❌ 同名艺术家无法消歧义
- ❌ 无法手动更正错误匹配
- ❌ 不考虑上下文信息(城市、场馆、风格)
- ❌ 无学习能力
- ❌ 无自动触发机制

## 改进方向

### 1. 基于上下文的艺术家消歧义

#### 问题描述
当多个艺术家同名时,当前算法只返回第一个匹配。例如:
- "DJ Shadow" - 可能是美国的DJ Shadow或其他地区的同名DJ
- "Amelie Lens" - 可能是本人或同名艺术家

#### 解决方案

##### 1.1 城市匹配
```python
def _find_match_with_context(
    self,
    name: str,
    entity_type: str,
    event_city: Optional[str] = None
) -> Optional[Tuple[int, float]]:
    """
    考虑城市信息的匹配
    """
    candidates = self._find_all_matches(name, entity_type)

    if len(candidates) == 1:
        return candidates[0]

    # 优先匹配同城艺术家
    if event_city:
        for entity_id, confidence in candidates:
            artist = db.query(RefArtist).get(entity_id)
            if artist.city and artist.city.lower() == event_city.lower():
                return (entity_id, confidence * 1.1)  # 提升置信度

    # 返回置信度最高的
    return max(candidates, key=lambda x: x[1])
```

##### 1.2 场馆历史匹配
```python
def _get_venue_artist_history(
    self,
    venue_id: int,
    artist_name: str
) -> List[int]:
    """
    查询该场馆历史上出现过的同名艺术家
    """
    return db.query(EventEntityMatch.entity_id)\
        .join(Event)\
        .filter(
            Event.venue_id == venue_id,
            EventEntityMatch.raw_name.ilike(f"%{artist_name}%"),
            EventEntityMatch.entity_type == "artist"
        )\
        .distinct()\
        .all()
```

##### 1.3 风格相似度
```python
def _calculate_style_similarity(
    self,
    artist_id: int,
    event_lineup: List[str]
) -> float:
    """
    计算艺术家与活动lineup的风格相似度
    """
    artist = db.query(RefArtist).get(artist_id)
    artist_styles = set(artist.styles or [])

    # 获取lineup中其他艺术家的风格
    lineup_styles = set()
    for name in event_lineup:
        matched = self._find_match(name, "artist")
        if matched:
            other_artist = db.query(RefArtist).get(matched[0])
            lineup_styles.update(other_artist.styles or [])

    # 计算Jaccard相似度
    if not artist_styles or not lineup_styles:
        return 0.5

    intersection = len(artist_styles & lineup_styles)
    union = len(artist_styles | lineup_styles)
    return intersection / union if union > 0 else 0
```

##### 1.4 综合评分
```python
def _calculate_final_score(
    self,
    base_confidence: float,
    city_match: bool,
    venue_history: bool,
    style_similarity: float
) -> float:
    """
    综合多个因素计算最终置信度
    """
    score = base_confidence

    if city_match:
        score *= 1.2

    if venue_history:
        score *= 1.3

    score *= (0.7 + 0.3 * style_similarity)

    return min(score, 1.0)
```

### 2. 手动更正UI

#### 2.1 UI设计

**位置**: Scraper Events详情页

**功能**:
- 显示当前匹配的艺术家列表
- 每个匹配旁边显示置信度和"更正"按钮
- 点击"更正"打开搜索对话框
- 搜索RefArtist并选择正确的艺术家
- 保存更正并更新EventEntityMatch

#### 2.2 组件结构
```typescript
// EventMatchEditor.tsx
interface EventMatchEditorProps {
  eventId: number;
  matches: EventEntityMatch[];
  onUpdate: () => void;
}

function EventMatchEditor({ eventId, matches, onUpdate }: EventMatchEditorProps) {
  const [editing, setEditing] = useState<number | null>(null);

  const handleCorrect = async (matchId: number, newEntityId: number) => {
    await scraperApi.correctMatch(matchId, newEntityId);
    onUpdate();
  };

  return (
    <div className="space-y-2">
      {matches.map(match => (
        <div key={match.id} className="flex items-center justify-between">
          <div>
            <span className="font-medium">{match.raw_name}</span>
            <span className="text-sm text-gray-500 ml-2">
              → {match.entity_name}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              ({(match.confidence * 100).toFixed(0)}%)
            </span>
          </div>
          <button onClick={() => setEditing(match.id)}>
            更正
          </button>
        </div>
      ))}

      {editing && (
        <ArtistSearchDialog
          onSelect={(artistId) => handleCorrect(editing, artistId)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
```

#### 2.3 后端API
```python
# scraper/app/routers/refdata.py

@router.patch("/event-match/{match_id}")
async def correct_match(
    match_id: int,
    new_entity_id: int,
    db: Session = Depends(get_db)
):
    """
    手动更正匹配
    """
    match = db.query(EventEntityMatch).get(match_id)
    if not match:
        raise HTTPException(404, "Match not found")

    # 记录更正历史
    correction = MatchCorrection(
        match_id=match_id,
        old_entity_id=match.entity_id,
        new_entity_id=new_entity_id,
        corrected_at=datetime.utcnow()
    )
    db.add(correction)

    # 更新匹配
    match.entity_id = new_entity_id
    match.confidence = 1.0  # 手动更正的置信度为100%
    match.is_manual = True

    db.commit()

    return {"status": "success"}
```

### 3. 学习系统

#### 3.1 从用户更正中学习

**数据收集**:
- 记录所有手动更正到`match_corrections`表
- 包含: 原始名称、错误匹配ID、正确匹配ID、上下文信息

**学习策略**:
```python
class MatchLearner:
    def learn_from_corrections(self, db: Session):
        """
        分析历史更正,提取规则
        """
        corrections = db.query(MatchCorrection).all()

        # 1. 名称变体学习
        for correction in corrections:
            old_artist = db.query(RefArtist).get(correction.old_entity_id)
            new_artist = db.query(RefArtist).get(correction.new_entity_id)

            # 如果raw_name更接近new_artist,添加为alias
            if self._should_add_alias(correction.raw_name, new_artist):
                self._add_alias(new_artist, correction.raw_name)

        # 2. 上下文规则学习
        self._learn_venue_preferences(corrections)
        self._learn_city_patterns(corrections)
        self._learn_style_associations(corrections)

    def _learn_venue_preferences(self, corrections):
        """
        学习特定场馆倾向于邀请哪些艺术家
        """
        venue_artist_map = defaultdict(Counter)

        for correction in corrections:
            event = correction.match.event
            venue_artist_map[event.venue_id][correction.new_entity_id] += 1

        # 保存到venue_artist_preferences表
        for venue_id, artist_counts in venue_artist_map.items():
            for artist_id, count in artist_counts.items():
                if count >= 3:  # 至少出现3次才认为是偏好
                    self._save_preference(venue_id, artist_id, count)
```

#### 3.2 主动学习

**策略**:
- 识别低置信度匹配(<0.8)
- 在UI中标记为"需要确认"
- 用户确认后加入训练数据

**UI提示**:
```typescript
function LowConfidenceWarning({ match }: { match: EventEntityMatch }) {
  if (match.confidence >= 0.8) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
      <p className="text-sm text-yellow-800">
        ⚠️ 此匹配置信度较低 ({(match.confidence * 100).toFixed(0)}%)
      </p>
      <div className="mt-2 space-x-2">
        <button onClick={() => confirmMatch(match.id)}>
          确认正确
        </button>
        <button onClick={() => correctMatch(match.id)}>
          需要更正
        </button>
      </div>
    </div>
  );
}
```

### 4. 自动触发机制

#### 4.1 触发时机

**场景1: 新活动提取完成**
```python
# scraper/app/services/extractor.py

async def extract_event(self, page_id: int):
    # ... 提取逻辑 ...

    # 提取完成后自动匹配
    if event.status == "complete":
        await self.matcher.match_event(event.id, db)
```

**场景2: RefData更新**
```python
# scraper/app/routers/refdata.py

@router.post("/ref-artists")
async def create_artist(artist: RefArtistCreate):
    # 创建艺术家
    new_artist = RefArtist(**artist.dict())
    db.add(new_artist)
    db.commit()

    # 触发相关活动的重新匹配
    await rematch_events_with_artist_name(artist.name, db)

    return new_artist
```

**场景3: 定时任务**
```python
# scraper/app/scheduler.py

@scheduler.scheduled_job('cron', hour=2)  # 每天凌晨2点
async def daily_rematch():
    """
    每日重新匹配最近的活动
    """
    cutoff_date = datetime.utcnow() - timedelta(days=30)

    events = db.query(Event)\
        .filter(Event.date >= cutoff_date)\
        .filter(Event.status == "complete")\
        .all()

    for event in events:
        try:
            await matcher.match_event(event.id, db)
        except Exception as e:
            logger.error(f"Failed to rematch event {event.id}: {e}")
```

#### 4.2 增量匹配

**优化策略**:
- 只重新匹配未匹配或低置信度的记录
- 跳过已手动确认的匹配
- 使用缓存减少数据库查询

```python
def should_rematch(self, match: EventEntityMatch) -> bool:
    """
    判断是否需要重新匹配
    """
    if match.is_manual:
        return False  # 手动匹配不重新处理

    if match.confidence >= 0.9:
        return False  # 高置信度不重新处理

    # 检查RefArtist是否有更新
    artist = db.query(RefArtist).get(match.entity_id)
    if artist.updated_at > match.created_at:
        return True  # RefData更新后需要重新匹配

    return False
```

### 5. 性能优化

#### 5.1 批量处理
```python
def match_events_batch(self, event_ids: List[int], batch_size: int = 50):
    """
    批量匹配,减少数据库往返
    """
    for i in range(0, len(event_ids), batch_size):
        batch = event_ids[i:i+batch_size]

        # 预加载所有需要的数据
        events = db.query(Event).filter(Event.id.in_(batch)).all()
        slots = db.query(TimetableSlot).filter(
            TimetableSlot.event_id.in_(batch)
        ).all()

        # 批量匹配
        for event in events:
            self._match_event_with_preloaded_data(event, slots)
```

#### 5.2 缓存策略
```python
from functools import lru_cache

class Matcher:
    @lru_cache(maxsize=1000)
    def _get_artist_by_name(self, name: str) -> Optional[RefArtist]:
        """
        缓存艺术家查询结果
        """
        return db.query(RefArtist)\
            .filter(RefArtist.name.ilike(name))\
            .first()

    def clear_cache(self):
        """
        RefData更新后清除缓存
        """
        self._get_artist_by_name.cache_clear()
```

## 实施计划

### Phase 1: 基础改进 (1-2周)
- [ ] 实现城市匹配
- [ ] 实现场馆历史匹配
- [ ] 添加综合评分算法
- [ ] 测试消歧义效果

### Phase 2: 手动更正UI (1周)
- [ ] 设计UI组件
- [ ] 实现后端API
- [ ] 添加更正历史记录
- [ ] 集成到Events详情页

### Phase 3: 学习系统 (2-3周)
- [ ] 设计数据库schema
- [ ] 实现学习算法
- [ ] 添加主动学习UI
- [ ] 测试学习效果

### Phase 4: 自动化 (1周)
- [ ] 实现自动触发机制
- [ ] 添加增量匹配逻辑
- [ ] 设置定时任务
- [ ] 监控和日志

### Phase 5: 优化 (1周)
- [ ] 批量处理优化
- [ ] 添加缓存层
- [ ] 性能测试
- [ ] 文档更新

## 成功指标

### 匹配准确率
- **目标**: >95%的匹配准确率
- **测量**: 手动更正率 < 5%

### 消歧义能力
- **目标**: 同名艺术家正确率 >90%
- **测量**: 对比人工标注结果

### 性能
- **目标**: 单个活动匹配 <100ms
- **目标**: 批量匹配(100个活动) <10s

### 用户体验
- **目标**: 手动更正操作 <3次点击
- **目标**: 低置信度匹配 <10%

## 相关文档

- [REMATCH_GUIDE.md](REMATCH_GUIDE.md) - Rematch功能使用指南
- [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md) - Events功能完整指南
- [EVENTS_INTEGRATION_PLAN.md](EVENTS_INTEGRATION_PLAN.md) - 技术实现方案
