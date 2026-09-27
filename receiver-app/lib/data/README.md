区域选择参考数据：Natural Earth 1:10m admin_0_countries v5.1.2，ADM0_A3=CHN。
来源：https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
原始文件 SHA256：239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255
许可：公有领域 https://www.naturalearthdata.com/about/terms-of-use/
仅用于地图服务路由，不作为法定国界、导航边界或精确地理判定。坐标保留5位小数；边界附近允许手动切换。

海外地图样式 world-style.json：2026-09-27 从 Geoapify 官方 OSM Bright style.json 取得，按其文档进行中文/原名优先显示定制。
来源：https://apidocs.geoapify.com/docs/maps/map-tiles/
语言设置：https://apidocs.geoapify.com/how-to/maps/localize-map/
public/map-assets/v1 保存此样式配套的图标，以及 Noto Sans Regular 的拉丁/泰文字形片段；来自相同 Geoapify 服务，浏览器免再次向地图接口查询这些静态素材。保留 OpenStreetMap、OpenMapTiles、Geoapify 署名。

map-assets-v2.json 是上述固定素材的 gzip/base64 分发清单，仅用于服务端版本化素材接口；保持原素材与许可证。清单不包含地点记录、坐标或Key。
