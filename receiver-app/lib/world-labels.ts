// Supplementary display names. Never use these aliases to geocode or move a point.
// Exact matching only: e.g. Subway the restaurant must not rename a subway station.
// See docs/world-labels.md for provenance and the limits of this small dictionary.
export const brandNames:Record<string,string>={adidas:'阿迪达斯',subway:'赛百味'};
export const referenceNames:Record<string,string>={
 'sabai place don muang airport':'廊曼机场萨拜旅馆','90’s city bar':'九十年代城市酒吧',"90's city bar":'九十年代城市酒吧','cn lighting':'CN灯具',
 'kosum ruam chai rd.':'科松鲁安猜路','wat thep nimit':'帖尼密寺','khlong ta ut':'塔乌运河',
 'smile theory dental clinic':'微笑理论牙科诊所','hokkaido bake don mueang':'廊曼北海道烘焙',
 'otteri wash & dry':'奥特里洗衣烘干店','24 hostel don mueang':'廊曼24号旅舍',
 'hoppers place':'霍珀斯旅馆','la malila cafe & hostel':'拉玛莉拉咖啡与旅舍',
 'cuppa chill':'悠闲咖啡','pacharapun pet clinic':'帕查拉蓬宠物诊所',
 'radisson hotel don mueang bangkok':'曼谷廊曼丽笙酒店','idaho burger don muang':'廊曼爱达荷汉堡',
 'coffee tree donmaung':'廊曼咖啡树','coffee and bakery':'咖啡与烘焙','pizza house':'披萨屋',
 'harrow international school bangkok':'曼谷哈罗国际学校','sabai place don mueang airport':'廊曼机场萨拜旅馆',
 'mont place don mueang':'廊曼蒙特旅馆','stand by club bbq':'待命俱乐部烧烤',
 'twig coffee & c space':'枝桠咖啡与共享空间','pa pang pang home coffee':'帕邦邦家庭咖啡',
 'u like salon':'优莱克美发店','chill cafe donmuang':'廊曼悠闲咖啡','allday_cafe':'全天咖啡',
 'bluebird booking':'蓝鸟预订','snowfruit':'雪果','deknoi korean':'德克诺伊韩式餐厅',
 '7-eleven':'7-Eleven便利店',"lotus's":'莲花超市','kfc':'肯德基',

 'krispy kreme':'克里斯皮奶油甜甜圈','black canyon':'黑峡谷咖啡',"chester's":'切斯特餐厅',
 'the coffee club':'咖啡俱乐部','café ritazza':'里塔扎咖啡','red diamond':'红钻咖啡',
 'magic food park':'魔法美食广场','vegetarian restaurant':'素食餐厅','shuttle bus':'接驳巴士',
 'don muang':'廊曼','don mueang':'廊曼','don mueang district office':'廊曼区办事处',
 'sanam bin':'沙南宾片区','choet wutthakat rd.':'乔特武他卡路','vibhavadi rangsit rd.':'维帕瓦迪兰实路',
 'phahon yothin rd.':'帕凤裕庭路','soi phahon yothin 54/1':'帕凤裕庭54/1巷',
 'song prapha rd.':'松巴帕路','soi song prapha 3':'松巴帕3巷','kamphaeng phet 6 rd.':'甘烹碧6路',
 'chang akat uthit rd.':'昌阿卡乌提路','thewarit phanluek rd.':'特瓦里潘勒路',
 'don mueang tollway':'廊曼收费高架路','khlong prem prachakon':'普雷姆巴差功运河',
 'arrivals pick-up area, terminal 1':'1号航站楼到达接客区','arrivals pick-up area, terminal 2':'2号航站楼到达接客区',
 'departures drop-off area, terminal 1':'1号航站楼出发送客区','departures drop-off area, terminal 2':'2号航站楼出发送客区',
};
// These are category descriptions, not invented Chinese business/place names.
export const categoryNames:Record<string,string>={
 laundry:'洗衣店',police:'警察局',community:'社区服务',florist:'鲜花店',travel_agency:'旅行服务',place:'地点',historic:'历史地点',car_repair:'汽车服务',beauty:'美容美发',hardware:'五金家居',office:'服务机构',fitness:'健身健康',pet:'宠物服务',car_parts:'汽车配件',electronics:'电子用品',industrial:'生产企业',bar:'酒吧',
 cafe:'咖啡店',restaurant:'餐厅',fast_food:'快餐店',food_court:'美食广场',shop:'商铺',jewelry:'珠宝店',
 clothing_store:'服装店',clothes:'服装店',sports:'运动用品店',bakery:'烘焙店',convenience:'便利店',supermarket:'超市',
 lodging:'住宿',hotel:'酒店',hostel:'旅舍',atm:'取款机',bank:'银行',pharmacy:'药店',hospital:'医院',clinic:'诊所',dentist:'牙科',
 railway:'铁路车站',station:'车站',bus:'公交站',bus_stop:'公交站',airport:'机场',aerodrome:'机场',
 school:'学校',college:'学院',university:'大学',kindergarten:'幼儿园',town_hall:'市政机构',
 parking:'停车场',fuel:'加油站',toilets:'洗手间',drinking_water:'饮水点',sports_centre:'运动中心',golf:'高尔夫球场',
 park:'公园',garden:'花园',museum:'博物馆',place_of_worship:'宗教场所',buddhist:'佛寺',
 canal:'运河',river:'河流',stream:'溪流',ditch:'水沟',lake:'湖泊',suburb:'片区',quarter:'街区',city:'城市',town:'城镇',village:'村庄',
};
export const restaurantClasses=['fast_food','restaurant','cafe','food_court'];
export function readablePlaceName(original:string):string{
 const key=original.trim().toLowerCase();
 // The geocoder result is a named POI; Subway still needs an explicit category,
 // so it is only supplemented by the vector expression where that is available.
 const official=key==='subway'?undefined:brandNames[key];
 const translated=official||referenceNames[key];
 return translated?`${translated}${official?'':'†'} · ${original}`:original;
}
