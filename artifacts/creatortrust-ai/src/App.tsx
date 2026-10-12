import { useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Link, useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import {
  ArrowUpRight, Bell, Boxes, ChartNoAxesCombined, Check, ChevronRight, FileBarChart2, FileCheck2,
  Home, MapPin, Menu, Package, Plus, Search, Settings, ShieldCheck, ShoppingBag, Sparkles, Star,
  Users, Video, Wallet, X, Upload, RefreshCw, Link2, MessageSquareText, ArrowRight, Download
} from 'lucide-react';
import {
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useListPromoters, useCreatePromoter, useUpdatePromoter, useDeletePromoter, useFindPromoterMatches,
  useListPromoterReviews, useCreatePromoterReview, useListCampaigns, useCreateCampaign, useUpdateCampaign,
  useDeleteCampaign, useConfirmCampaignAgreement, useListCampaignTimeline, useCreateCampaignTimelineEntry,
  useListCampaignMetrics, useCreateCampaignMetric, useListTrackingLinks, useCreateTrackingLink,
  useListOrders, useCreateOrder, useUpdateOrder, useDeleteOrder, useImportOrders,
  useListCustomerReviews, useCreateCustomerReview, useListExpenses, useCreateExpense, useUpdateExpense,
  useDeleteExpense, useGetDashboardSummary, useGetDemandAnalytics, useGetLocationAnalytics,
  useGetFinancialAnalytics, useListNotifications, useAskBusinessInsight, useRequestUploadUrl, useGetStorageObject,
  getListProductsQueryKey, getListPromotersQueryKey, getListPromoterReviewsQueryKey, getListCampaignsQueryKey,
  getListCampaignTimelineQueryKey, getListCampaignMetricsQueryKey, getListTrackingLinksQueryKey,
  getListOrdersQueryKey, getListCustomerReviewsQueryKey, getListExpensesQueryKey,
  getGetDashboardSummaryQueryKey, getGetDemandAnalyticsQueryKey, getGetLocationAnalyticsQueryKey,
  getGetFinancialAnalyticsQueryKey, getListNotificationsQueryKey, getFindPromoterMatchesQueryKey,
  getVisitTrackingLinkUrl, getGetStorageObjectQueryKey,
  type Product, type Promoter, type Campaign, type Order, type Expense, type CampaignMetric,
  type PromoterMatch, type TimelineEntry, type TrackingLink, type CustomerReview
} from '@workspace/api-client-react';

const qc = new QueryClient();
const navGroups: Array<{name:string;items:Array<[string,string,typeof Home]>}> = [
  { name: 'Workspace', items: [['/', 'Overview', Home], ['/products', 'Products', Package], ['/promoters/discover', 'Discover promoters', Search], ['/promoters/compare', 'Compare shortlist', Users], ['/promoter-reviews', 'Promoter reviews', Star]] },
  { name: 'Campaigns', items: [['/campaigns', 'Agreements', FileCheck2], ['/videos', 'Creative timeline', Video], ['/promotion-analytics', 'Promotion analytics', ChartNoAxesCombined], ['/links', 'Tracking links', Link2]] },
  { name: 'Commerce', items: [['/orders', 'Orders & attribution', ShoppingBag], ['/locations', 'Locations & delivery', MapPin], ['/reviews', 'Customer reviews', MessageSquareText], ['/demand', 'Demand planning', Boxes]] },
  { name: 'Performance', items: [['/financials', 'Financials', Wallet], ['/insights', 'Ask your business', Sparkles], ['/reports', 'Reports', FileBarChart2]] },
  { name: 'Workspace setup', items: [['/settings', 'Settings & data', Settings]] },
] as const;
const titles: Record<string, [string, string, string]> = {
  '/':['Workspace overview','Good work starts with clear signals.','An operational view across products, creators, campaigns and orders.'],
  '/products':['Product register','Make every promotion product-ready.','Keep pricing, stock, variants and launch details in one dependable record.'],
  '/promoters/discover':['Promoter discovery','Find a useful audience fit.','Match from your product details, then validate every profile before committing.'],
  '/promoters/compare':['Shortlist comparison','Compare what is known.','Side-by-side records make gaps visible before a campaign is agreed.'],
  '/promoter-reviews':['Promoter reviews','Keep a record of working relationships.','Manual feedback is useful context, not an independently verified rating.'],
  '/campaigns':['Campaign agreements','Put the scope in writing.','Track agreed deliverables, payment, dates and protected agreement documents.'],
  '/videos':['Creative timeline','Move from brief to published.','Submission, revision, approval and publication stay attached to their campaign.'],
  '/promotion-analytics':['Promotion analytics','Read the attention, not just the headline.','Recorded reach, views, clicks and interest are separate from actual orders.'],
  '/links':['Tracking links','Give each campaign a destination.','Clicks show visits through a link; they do not confirm an order.'],
  '/orders':['Orders & attribution','Sales begin with recorded orders.','Create or import privacy-safe order records, then link them to campaigns.'],
  '/locations':['Locations & delivery','See where interest becomes delivery.','Location aggregates are derived from recorded order and delivery details.'],
  '/reviews':['Customer reviews','Listen after delivery.','Collect product feedback against delivered-order records, without storing customer names.'],
  '/demand':['Demand planning','Separate interest from purchase.','Use estimated demand signals alongside recorded orders and stock levels.'],
  '/financials':['Financial ledger','Understand the economics.','Sales, costs, margin and campaign ROI are calculated from recorded business data.'],
  '/insights':['Business insights','Ask a grounded question.','Answers use your available business records and disclose their limitations.'],
  '/reports':['Reports','Take the record with you.','Filter a useful working report, export CSV or print a clean copy.'],
  '/settings':['Settings & data','Know what the numbers mean.','Review your profile, sample-data disclosure and workflow boundaries.'],
};
const compareMetrics: Array<[string, (p: Promoter) => string]> = [
  ['Platform',p=>p.platform],['Category',p=>p.contentCategory],['Followers',p=>count(p.followers)],
  ['Engagement rate',p=>p.engagementRate==null?'Not available':`${p.engagementRate}%`],
  ['Average views',p=>p.averageViews==null?'Not available':count(p.averageViews)],
  ['Prior performance',p=>p.previousPerformance||'Not recorded'],['Quote',p=>money(p.quoteAmount)],
  ['Deliverables',p=>p.deliverables.join(', ')||'Not recorded'],
  ['Audience locations',p=>p.audienceLocations.join(', ')||'Not recorded'],
  ['Source',p=>p.dataSource],['Verification',p=>p.verificationStatus]
];
const money = (n: number | null | undefined, currency = 'INR') => new Intl.NumberFormat('en-IN', { style:'currency', currency, maximumFractionDigits:0 }).format(n ?? 0);
const count = (n: number | null | undefined) => new Intl.NumberFormat('en-US').format(n ?? 0);
const date = (s?: string | null) => s ? new Date(s).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : '—';
const badge = (s?: string | boolean | null) => {
  const text = typeof s === 'boolean' ? (s ? 'Verified' : 'Manual') : String(s ?? 'Unspecified');
  const kind = /sample/i.test(text) ? 'sample' : /verif/i.test(text) ? 'verified' : /manual|recorded|estimate/i.test(text) ? 'manual' : /overdue|failed|rejected|revision/i.test(text) ? 'alert' : 'neutral';
  return <span className={`badge ${kind}`} data-testid={`badge-${text.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}>{text}</span>;
};
type Field = { key:string; label:string; type?:string; options?:string[]; required?:boolean; full?:boolean; placeholder?:string };
type FormState = { title:string; fields:Field[]; initial?:Record<string,unknown>; submit:(v:Record<string,string>)=>void|Promise<void> };

function AuthGate() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [, setLocation] = useLocation();
  if (isLoading) return <div className="auth-screen"><div className="auth-art"><div className="brand"><div className="brand-mark">ct</div><div><div className="brand-name">CreatorTrust</div><div className="brand-caption">promotion workspace</div></div></div><div className="auth-headline">Good decisions<br/>need good records.</div><p className="auth-copy">Bring product, promotion and order records into one calm, connected workspace.</p></div><div className="auth-form"><div className="auth-box"><div className="loading-line"/><div className="loading-line"/><div className="loading-line"/></div></div></div>;
  if (!isAuthenticated) return <div className="auth-screen"><div className="auth-art"><div className="brand"><div className="brand-mark">ct</div><div><div className="brand-name">CreatorTrust</div><div className="brand-caption">promotion workspace</div></div></div><div><div className="auth-headline">Good decisions<br/>need good records.</div><p className="auth-copy">Coordinate creator campaigns, follow real orders and learn what your customers value — without confusing estimates for outcomes.</p></div><div className="top-tag">PRODUCT · PROMOTION · COMMERCE</div></div><div className="auth-form"><div className="auth-box"><div className="eyebrow">Your workspace awaits</div><h2>Sign in to continue</h2><p>Use your secure workspace identity to access products, campaign agreements and business records.</p><button type="button" className="btn" onClick={login} data-testid="button-sign-in">Continue to sign in <ArrowRight size={15}/></button><button type="button" className="btn secondary" style={{marginTop:10,width:'100%'}} onClick={()=>setLocation('/demo')} data-testid="button-continue-as-guest">Continue as Guest <ArrowRight size={15}/></button><p style={{fontSize:11,marginTop:18}}>Guest mode is read-only and uses fictional sample data. No account is required to explore it.</p></div></div></div>;
  return <Workspace name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Workspace owner'} onLogout={logout} />;
}

function Workspace({name,onLogout}:{name:string;onLogout:()=>void}) {
  const [path, setPath] = useLocation();
  const [form, setForm] = useState<FormState | null>(null);
  const [toast, setToast] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [productForMatch, setProductForMatch] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState(0);
  const [selectedPromoters, setSelectedPromoters] = useState<number[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [filter, setFilter] = useState('all');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [uploadState, setUploadState] = useState('');
  const queryClient = useQueryClient();

  const productsQ=useListProducts(), promotersQ=useListPromoters(), promoterReviewsQ=useListPromoterReviews(),
    campaignsQ=useListCampaigns(), metricsQ=useListCampaignMetrics(), linksQ=useListTrackingLinks(), ordersQ=useListOrders(),
    customerReviewsQ=useListCustomerReviews(), expensesQ=useListExpenses(), dashboardQ=useGetDashboardSummary(),
    demandQ=useGetDemandAnalytics(), locationsQ=useGetLocationAnalytics(), financialQ=useGetFinancialAnalytics(), notificationsQ=useListNotifications();
  const products=productsQ.data ?? [], promoters=promotersQ.data ?? [], campaigns=campaignsQ.data ?? [], orders=ordersQ.data ?? [];
  const chosenProduct=products.find(p=>p.id===productForMatch) ?? products[0];
  const matchParams={productId:chosenProduct?.id ?? 0};
  const matchesQ=useFindPromoterMatches(matchParams,{query:{enabled:path==='/promoters/discover'&&Boolean(chosenProduct),queryKey:getFindPromoterMatchesQueryKey(matchParams)}});
  const activeCampaign=campaigns.find(c=>c.id===selectedCampaign) ?? campaigns[0];
  const timelineQ=useListCampaignTimeline(activeCampaign?.id ?? 0,{query:{enabled:path==='/videos'&&Boolean(activeCampaign),queryKey:getListCampaignTimelineQueryKey(activeCampaign?.id ?? 0)}});
  const createProduct=useCreateProduct(), updateProduct=useUpdateProduct(), deleteProduct=useDeleteProduct();
  const createPromoter=useCreatePromoter(), updatePromoter=useUpdatePromoter(), deletePromoter=useDeletePromoter();
  const createPromoterReview=useCreatePromoterReview(), createCampaign=useCreateCampaign(), updateCampaign=useUpdateCampaign(), deleteCampaign=useDeleteCampaign(), confirmAgreement=useConfirmCampaignAgreement();
  const createTimeline=useCreateCampaignTimelineEntry(), createMetric=useCreateCampaignMetric(), createLink=useCreateTrackingLink();
  const createOrder=useCreateOrder(), updateOrder=useUpdateOrder(), deleteOrder=useDeleteOrder(), importOrders=useImportOrders();
  const createCustomerReview=useCreateCustomerReview(), createExpense=useCreateExpense(), updateExpense=useUpdateExpense(), deleteExpense=useDeleteExpense();
  const askInsight=useAskBusinessInsight(), requestUpload=useRequestUploadUrl();
  const title=titles[path] ?? titles['/'];
  const showToast=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),3500)};
  const refresh=(keys:readonly (readonly unknown[])[])=>Promise.all(keys.map(queryKey=>queryClient.invalidateQueries({queryKey})));
  const commonRefresh=()=>refresh([getListProductsQueryKey(),getListPromotersQueryKey(),getListCampaignsQueryKey(),getListOrdersQueryKey(),getListExpensesQueryKey(),getGetDashboardSummaryQueryKey(),getGetDemandAnalyticsQueryKey(),getGetLocationAnalyticsQueryKey(),getGetFinancialAnalyticsQueryKey()]);
  const openForm=(state:FormState)=>setForm(state);
  const requiredFields=new Set(['name','category','sellingPrice','unitCost','stock','targetQuantity','orderCode','orderDate','variant','quantity','unitPrice','paymentStatus','status','platform','contentCategory','followers','quoteAmount','amount','expenseDate']);
  const input=(key:string,label:string,type='text',placeholder='',options?:string[],full=false):Field=>({key,label,type,placeholder,options,full,required:requiredFields.has(key)});
  const startProduct=(p?:Product)=>openForm({title:p?'Edit product':'Register a product',fields:[
    input('name','Product name'),input('category','Category'),input('imageUrl','Product image URL','url'),input('description','Description','textarea','What makes it distinctive?',undefined,true),
    input('sellingPrice','Selling price','number'),input('unitCost','Unit cost','number'),input('stock','Available stock','number'),input('targetQuantity','Target quantity','number'),
    input('qualityDetails','Quality details','text'),input('colors','Colors','text','Separate with commas'),input('sizes','Sizes','text','Separate with commas'),
    input('purchaseUrl','Purchase URL','url'),input('targetAudience','Target audience'),input('targetLocations','Target locations','text','Separate with commas'),
    input('promotionBudget','Promotion budget','number'),input('launchDate','Launch date','date')
  ],initial:p as unknown as Record<string,unknown>,submit:async v=>{
    const payload={name:v.name,category:v.category,imageUrl:v.imageUrl||null,description:v.description||'',sellingPrice:+v.sellingPrice,unitCost:+v.unitCost,stock:+v.stock,targetQuantity:+v.targetQuantity,promotionBudget:+v.promotionBudget,colors:v.colors.split(',').map(x=>x.trim()).filter(Boolean),sizes:v.sizes.split(',').map(x=>x.trim()).filter(Boolean),targetLocations:v.targetLocations.split(',').map(x=>x.trim()).filter(Boolean),purchaseUrl:v.purchaseUrl||null,launchDate:v.launchDate||null,qualityDetails:v.qualityDetails||'',targetAudience:v.targetAudience||''};
    if(p) await updateProduct.mutateAsync({id:p.id,data:payload}); else await createProduct.mutateAsync({data:payload});
    await commonRefresh();showToast(p?'Product updated':'Product registered');
  }});
  const startCampaign=(c?:Campaign)=>openForm({title:c?'Edit campaign':'Create campaign agreement',fields:[
    input('name','Campaign name'),{key:'productId',label:'Product',type:'select',options:products.map(p=>`${p.id} · ${p.name}`),required:true},
    {key:'promoterId',label:'Promoter',type:'select',options:promoters.map(p=>`${p.id} · ${p.name}`),required:true},input('agreedPrice','Agreed price','number'),
    input('videoCount','Video count','number'),input('postCount','Post count','number'),input('requiredContent','Required content','textarea','Content brief',undefined,true),
    input('productLink','Product destination','url'),input('startDate','Start date','date'),input('submissionDeadline','Submission deadline','date'),input('publicationDeadline','Publication deadline','date'),
    {key:'paymentStatus',label:'Payment status',type:'select',options:['unpaid','partial','paid']},
    input('revisionTerms','Revision terms','text'),input('deliverables','Deliverables','text','Separate with commas'),input('campaignTerms','Campaign terms','textarea','Terms and conditions',undefined,true)
  ],initial:c?{...c,productId:`${c.productId} · ${products.find(p=>p.id===c.productId)?.name??''}`,promoterId:`${c.promoterId} · ${promoters.find(p=>p.id===c.promoterId)?.name??''}`} as unknown as Record<string,unknown>:undefined,submit:async v=>{
    const pid=Number(v.productId.split(' · ')[0]), promoterId=Number(v.promoterId.split(' · ')[0]);
    const payload={name:v.name,productId:pid,promoterId,agreedPrice:+v.agreedPrice,videoCount:+v.videoCount,postCount:+v.postCount,requiredContent:v.requiredContent,productLink:v.productLink||null,startDate:v.startDate||null,submissionDeadline:v.submissionDeadline||null,publicationDeadline:v.publicationDeadline||null,paymentStatus:(v.paymentStatus||'unpaid') as 'unpaid'|'partial'|'paid',revisionTerms:v.revisionTerms||'',deliverables:v.deliverables.split(',').map(x=>x.trim()).filter(Boolean),campaignTerms:v.campaignTerms||''};
    if(c) await updateCampaign.mutateAsync({id:c.id,data:payload});else await createCampaign.mutateAsync({data:payload});
    await commonRefresh();showToast(c?'Campaign updated':'Campaign agreement created');
  }});
  const startOrder=(o?:Order)=>openForm({title:o?'Edit order':'Record an order',fields:[
    input('orderCode','Order reference'),input('orderDate','Order date','date'),{key:'productId',label:'Product',type:'select',options:products.map(p=>`${p.id} · ${p.name}`),required:true},
    input('variant','Variant'),input('quantity','Quantity','number'),input('unitPrice','Unit price','number'),input('discount','Discount','number'),
    input('customerRef','Privacy-safe customer reference'),input('city','City'),input('district','District'),input('state','State'),input('pinCode','Postcode'),
    {key:'paymentStatus',label:'Payment status',type:'select',options:['pending','paid','refunded','partial'],required:true},{key:'status',label:'Order status',type:'select',options:['placed','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','delivery_failed','returned'],required:true},{key:'returnStatus',label:'Return status',type:'select',options:['none','requested','returned','refunded']},
    {key:'campaignId',label:'Campaign ID (optional)'},{key:'promoterId',label:'Promoter ID (optional)'},input('source','Source'),input('trackingNumber','Tracking number'),input('courier','Courier'),input('dispatchDate','Dispatch date','date'),input('deliveryDate','Delivery date','date')
  ],initial:o?{...o,productId:`${o.productId} · ${productName(o.productId)}`} as unknown as Record<string,unknown>:undefined,submit:async v=>{
    const payload={orderCode:v.orderCode,orderDate:v.orderDate,productId:Number(v.productId.split(' · ')[0]),variant:v.variant,quantity:+v.quantity,unitPrice:+v.unitPrice,discount:+v.discount||0,customerRef:v.customerRef||null,city:v.city||null,district:v.district||null,state:v.state||null,pinCode:v.pinCode||null,paymentStatus:v.paymentStatus as 'pending'|'paid'|'refunded'|'partial',status:v.status as 'placed'|'confirmed'|'packed'|'shipped'|'out_for_delivery'|'delivered'|'cancelled'|'delivery_failed'|'returned',returnStatus:(v.returnStatus||'none') as 'none'|'requested'|'returned'|'refunded',campaignId:v.campaignId?Number(v.campaignId):null,promoterId:v.promoterId?Number(v.promoterId):null,source:v.source||'manual',trackingNumber:v.trackingNumber||null,courier:v.courier||null,dispatchDate:v.dispatchDate||null,deliveryDate:v.deliveryDate||null};
    if(o)await updateOrder.mutateAsync({id:o.id,data:payload});else await createOrder.mutateAsync({data:payload});await commonRefresh();showToast(o?'Order updated':'Order recorded');
  }});
  const openPromoter=(p?:Promoter)=>openForm({title:p?'Edit promoter record':'Add promoter record',fields:[
    input('name','Name'),input('platform','Platform'),input('contentCategory','Content category'),input('profileUrl','Profile URL','url'),input('followers','Followers','number'),
    input('engagementRate','Engagement rate (%)','number'),input('averageViews','Average views (if available)','number'),input('quoteAmount','Quoted amount','number'),
    input('audienceInterests','Audience interests','text','Separate with commas'),input('audienceLocations','Audience locations','text','Separate with commas'),
    input('previousPerformance','Previous performance notes','textarea','Manual notes only',undefined,true),input('deliverables','Deliverables','text','Separate with commas'),
    input('costPerVideo','Cost per video','number'),input('costPerPost','Cost per post','number'),input('costPerStory','Cost per story','number'),
    input('contact','Contact'),input('dataSource','Data source'),{key:'verificationStatus',label:'Verification status',type:'select',options:['manual','unverified','verified']}
  ],initial:p as unknown as Record<string,unknown>,submit:async v=>{
    const payload={name:v.name,platform:v.platform,contentCategory:v.contentCategory,profileUrl:v.profileUrl||null,followers:+v.followers,engagementRate:v.engagementRate?+v.engagementRate:null,averageViews:v.averageViews?+v.averageViews:null,costPerVideo:v.costPerVideo?+v.costPerVideo:null,costPerPost:v.costPerPost?+v.costPerPost:null,costPerStory:v.costPerStory?+v.costPerStory:null,quoteAmount:+v.quoteAmount,previousPerformance:v.previousPerformance||'',audienceInterests:v.audienceInterests.split(',').map(x=>x.trim()).filter(Boolean),audienceLocations:v.audienceLocations.split(',').map(x=>x.trim()).filter(Boolean),deliverables:v.deliverables.split(',').map(x=>x.trim()).filter(Boolean),contact:v.contact||null,dataSource:v.dataSource||'Manual',verificationStatus:v.verificationStatus as 'manual'|'unverified'|'verified'};
    if(p)await updatePromoter.mutateAsync({id:p.id,data:payload});else await createPromoter.mutateAsync({data:payload});await commonRefresh();showToast(p?'Promoter updated':'Promoter added');
  }});
  const createMetricRecord=()=>openForm({title:'Record promotion results',fields:[
    {key:'campaignId',label:'Campaign',type:'select',options:campaigns.map(c=>`${c.id} · ${c.name}`)},input('metricDate','Metric date','date'),
    ...['reach','views','impressions','likes','comments','shares','saves','linkClicks','enquiries','interestedCustomers','addToCart','attributedOrders'].map(k=>input(k,k.replace(/[A-Z]/g,m=>` ${m.toLowerCase()}`),'number')),
    input('audienceLocation','Audience location'),input('source','Source'),{key:'verified',label:'Verified data?',type:'select',options:['false','true']}
  ],submit:async v=>{await createMetric.mutateAsync({data:{campaignId:Number(v.campaignId.split(' · ')[0]),metricDate:v.metricDate,...Object.fromEntries(['reach','views','impressions','likes','comments','shares','saves','linkClicks','enquiries','interestedCustomers','addToCart','attributedOrders'].map(k=>[k,+v[k]||0])),audienceLocation:v.audienceLocation||null,source:v.source||'Manual',verified:v.verified==='true'}});await refresh([getListCampaignMetricsQueryKey(),getGetDashboardSummaryQueryKey()]);showToast('Promotion record saved');}});
  const createReviewRecord=()=>openForm({title:'Add customer review',fields:[
    {key:'orderId',label:'Delivered order',type:'select',options:orders.filter(o=>o.status==='delivered').map(o=>`${o.id} · ${o.orderCode}`)},
    input('rating','Overall rating','number'),input('qualityRating','Quality','number'),input('valueRating','Value','number'),input('priceSatisfaction','Price satisfaction','number'),input('packagingRating','Packaging','number'),input('deliveryRating','Delivery','number'),
    {key:'colorMatches',label:'Color matches?',type:'select',options:['true','false']},{key:'metExpectations',label:'Met expectations?',type:'select',options:['true','false']},{key:'recommend',label:'Would recommend?',type:'select',options:['true','false']},{key:'buyAgain',label:'Would buy again?',type:'select',options:['true','false']},input('variant','Variant'),input('location','Location'),input('comments','Comments','textarea','Customer feedback',undefined,true)
  ],submit:async v=>{const order=orders.find(o=>o.id===Number(v.orderId.split(' · ')[0]));if(!order)throw new Error('Choose a delivered order');await createCustomerReview.mutateAsync({data:{orderId:order.id,productId:order.productId,rating:+v.rating,qualityRating:+v.qualityRating,valueRating:+v.valueRating,priceSatisfaction:+v.priceSatisfaction,packagingRating:+v.packagingRating,deliveryRating:+v.deliveryRating,colorMatches:v.colorMatches==='true',metExpectations:v.metExpectations==='true',recommend:v.recommend==='true',buyAgain:v.buyAgain==='true',comments:v.comments,reviewDate:new Date().toISOString().slice(0,10),variant:v.variant,location:v.location||null}});await refresh([getListCustomerReviewsQueryKey()]);showToast('Customer review saved');}});
  const createExpenseRecord=()=>openForm({title:'Record an expense',fields:[
    {key:'category',label:'Cost category',type:'select',options:['promoter','advertising','packaging','shipping','platform_fee','other']},input('amount','Amount','number'),input('expenseDate','Expense date','date'),input('productId','Product ID (optional)'),input('campaignId','Campaign ID (optional)'),input('notes','Notes','textarea','',undefined,true)
  ],submit:async v=>{await createExpense.mutateAsync({data:{category:v.category as 'promoter'|'advertising'|'packaging'|'shipping'|'platform_fee'|'other',amount:+v.amount,expenseDate:v.expenseDate,productId:v.productId?+v.productId:null,campaignId:v.campaignId?+v.campaignId:null,notes:v.notes||''}});await commonRefresh();showToast('Expense recorded');}});
  const editExpenseRecord=(x:Expense)=>openForm({title:'Edit expense',fields:[
    {key:'category',label:'Cost category',type:'select',options:['promoter','advertising','packaging','shipping','platform_fee','other']},input('amount','Amount','number'),input('expenseDate','Expense date','date'),input('notes','Notes','textarea','',undefined,true)
  ],initial:x as unknown as Record<string,unknown>,submit:async v=>{await updateExpense.mutateAsync({id:x.id,data:{category:v.category as 'promoter'|'advertising'|'packaging'|'shipping'|'platform_fee'|'other',amount:+v.amount,expenseDate:v.expenseDate,notes:v.notes||''}});await commonRefresh();showToast('Expense updated')}});
  const removePromoter=async(p:Promoter)=>{if(window.confirm(`Delete promoter record for ${p.name}?`)){await deletePromoter.mutateAsync({id:p.id});await refresh([getListPromotersQueryKey()]);showToast('Promoter record deleted')}};
  const removeExpense=async(x:Expense)=>{if(window.confirm(`Delete this ${money(x.amount)} expense?`)){await deleteExpense.mutateAsync({id:x.id});await commonRefresh();showToast('Expense deleted')}};
  const saveForm=async(values:Record<string,string>)=>{try{await form?.submit(values);setForm(null)}catch(e){showToast(e instanceof Error?e.message:'Could not save record')}};

  const notifications=notificationsQ.data??[];
  const loading=productsQ.isLoading||campaignsQ.isLoading||ordersQ.isLoading;
  const errors=[productsQ,campaignsQ,ordersQ].filter(q=>q.isError);
  const dataBadge=(sample:boolean)=>badge(sample?'Sample':'Recorded');
  const productName=(id:number)=>products.find(p=>p.id===id)?.name??`Product ${id}`;
  const promoterName=(id:number)=>promoters.find(p=>p.id===id)?.name??`Promoter ${id}`;
  const campaignName=(id:number)=>campaigns.find(c=>c.id===id)?.name??`Campaign ${id}`;
  const clickDeleteProduct=async(p:Product)=>{if(window.confirm(`Delete ${p.name}? This cannot be undone.`)){await deleteProduct.mutateAsync({id:p.id});await commonRefresh();showToast('Product deleted')}};
  const clickDeleteOrder=async(o:Order)=>{if(window.confirm(`Delete order ${o.orderCode}?`)){await deleteOrder.mutateAsync({id:o.id});await commonRefresh();showToast('Order deleted')}};
  const toggleShortlist=async(p:Promoter)=>{await updatePromoter.mutateAsync({id:p.id,data:{isShortlisted:!p.isShortlisted}});await refresh([getListPromotersQueryKey()]);setSelectedPromoters(cur=>p.isShortlisted?cur.filter(id=>id!==p.id):[...new Set([...cur,p.id])]);showToast(p.isShortlisted?'Removed from shortlist':'Added to shortlist')};
  const headerActions=()=> {
    if(path==='/products')return <button className="btn" onClick={()=>startProduct()} data-testid="button-add-product"><Plus size={15}/> Register product</button>;
    if(path==='/promoters/discover')return <button className="btn secondary" onClick={()=>openPromoter()} data-testid="button-add-promoter"><Plus size={15}/> Add a record</button>;
    if(path==='/campaigns')return <button className="btn" onClick={()=>startCampaign()} data-testid="button-new-campaign"><Plus size={15}/> New agreement</button>;
    if(path==='/promotion-analytics')return <button className="btn" onClick={createMetricRecord} data-testid="button-record-metrics"><Plus size={15}/> Record results</button>;
    if(path==='/orders')return <div style={{display:'flex',gap:8}}><button className="btn outline" onClick={()=>document.getElementById('csv-import')?.click()} data-testid="button-import-csv"><Upload size={14}/> Import CSV</button><button className="btn" onClick={()=>startOrder()} data-testid="button-new-order"><Plus size={15}/> Record order</button></div>;
    if(path==='/reviews')return <button className="btn" onClick={createReviewRecord} data-testid="button-add-review"><Plus size={15}/> Add review</button>;
    if(path==='/financials')return <button className="btn" onClick={createExpenseRecord} data-testid="button-add-expense"><Plus size={15}/> Record expense</button>;
    if(path==='/links')return <button className="btn" onClick={()=>openForm({title:'Create tracking link',fields:[{key:'campaignId',label:'Campaign',type:'select',options:campaigns.map(c=>`${c.id} · ${c.name}`)},{key:'promoterId',label:'Promoter',type:'select',options:promoters.map(p=>`${p.id} · ${p.name}`)},input('destinationUrl','Destination URL','url')],submit:async v=>{await createLink.mutateAsync({data:{campaignId:+v.campaignId.split(' · ')[0],promoterId:+v.promoterId.split(' · ')[0],destinationUrl:v.destinationUrl}});await refresh([getListTrackingLinksQueryKey()]);showToast('Tracking link created')}})} data-testid="button-create-link"><Plus size={15}/> Create link</button>;
    return null;
  };

  const renderLoading=()=> <div className="surface"><div className="loading-line"/><div className="loading-line"/><div className="loading-line"/></div>;
  const renderError=()=> <div className="empty"><strong>Some records did not load</strong>Check your connection or try again.<br/><button className="btn outline small" style={{marginTop:12}} onClick={()=>window.location.reload()} data-testid="button-retry"><RefreshCw size={13}/> Retry</button></div>;
  const renderTableEmpty=(label:string)=> <div className="empty"><strong>No {label} yet</strong>Records you add will appear here. Sample examples are clearly labeled.</div>;

  const renderPage=()=>{
    if(loading)return renderLoading();
    if(errors.length)return renderError();
    if(path==='/') {
      const d=dashboardQ.data; if(dashboardQ.isLoading)return renderLoading();if(dashboardQ.isError)return renderError();
      const stats=[['Registered products',count(d?.productCount),'In your product register'],['Active campaigns',count(d?.activeCampaignCount),'Agreement workflow'],['Recorded orders',count(d?.orderCount),'Only recorded orders count as sales'],['Net profit',money(d?.netProfit,d?.currency),'Server-derived from recorded data']];
      return <><div className="notice" style={{marginBottom:16}}><strong>{d?.isSampleWorkspace?'Sample workspace':'Live workspace data'}</strong> · Values below are {d?.isSampleWorkspace?'clearly marked sample records':'from your records'}. Reach, clicks and interest are not orders. Calculations are server-derived.</div><div className="stat-grid">{stats.map(([label,val,foot])=><div className="stat-card" key={label} data-testid={`stat-${label.toLowerCase().replace(/ /g,'-')}`}><div className="stat-label">{label}</div><div className="stat-value">{val}</div><div className="stat-foot">{foot}</div></div>)}</div><div className="grid-two"><section className="surface"><div className="section-head"><div><h2 className="section-title">Recent activity</h2><div className="section-sub">Latest changes across the workspace</div></div>{badge(d?.isSampleWorkspace?'Sample':'Live')}</div>{d?.recentActivity?.length?<div className="timeline">{d.recentActivity.map(a=><div className="timeline-item" key={a.id} data-testid={`activity-${a.id}`}><div className="row-name">{a.title}</div><div className="row-meta">{a.detail} · {date(a.occurredAt)}</div></div>)}</div>:renderTableEmpty('activity')}</section><section className="surface"><div className="section-head"><div><h2 className="section-title">Needs your attention</h2><div className="section-sub">Operational signals from recorded records</div></div><Bell size={17}/></div>{notifications.length?notifications.slice(0,5).map(n=><div className="data-row" key={n.id} data-testid={`notification-${n.id}`}><div><div className="row-name">{n.title}</div><div className="row-meta">{n.message}</div></div>{badge(n.isSample?'Sample':n.severity)}</div>):<div className="empty"><strong>Nothing urgent on file</strong>Notifications appear when your records need attention.</div>}</section></div><section className="surface" style={{marginTop:16}}><div className="section-head"><div><h2 className="section-title">Promotion funnel, kept honest</h2><div className="section-sub">Attention signals and business outcomes are different things.</div></div></div><div className="grid-three">{[['Audience reach',d?.audienceReach],['Interested customers',d?.interestedCustomers],['Link clicks',d?.linkClicks],['Recorded orders',d?.orderCount],['Delivered orders',d?.deliveredOrders],['Units sold',d?.unitsSold]].map(([label,value])=><div className="stat-card" key={String(label)}><div className="stat-label">{label}</div><div className="stat-value">{count(Number(value))}</div><div className="stat-foot">{['Audience reach','Interested customers','Link clicks'].includes(String(label))?'Recorded promotion signal':'Counted from order records'}</div></div>)}</div></section></>;
    }
    if(path==='/products')return <section className="surface"><div className="section-head"><div><h2 className="section-title">Products</h2><div className="section-sub">{products.length} registered · price, cost and stock are manual business records</div></div><div className="search-input" style={{display:'flex',gap:8,alignItems:'center'}}><Search size={14}/><input aria-label="Search products" data-testid="input-search-products" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Find a product" style={{border:0,outline:0,background:'transparent',width:145,fontSize:12}}/></div></div>{products.length?<div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price / cost</th><th>Stock</th><th>Audience / locations</th><th>Source</th><th>Actions</th></tr></thead><tbody>{products.filter(p=>p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p=><tr key={p.id} data-testid={`row-product-${p.id}`}><td className="primary-cell">{p.name}<span className="sub-cell">{p.description}</span></td><td>{p.category}</td><td>{money(p.sellingPrice)}<span className="sub-cell">Cost {money(p.unitCost)}</span></td><td>{count(p.stock)}<span className="sub-cell">Target {count(p.targetQuantity)}</span></td><td>{p.targetAudience||'—'}<span className="sub-cell">{p.targetLocations?.join(', ')||'No locations'}</span></td><td>{dataBadge(p.isSample)}</td><td><div style={{display:'flex',gap:6}}><button className="btn outline small" onClick={()=>startProduct(p)} data-testid={`button-edit-product-${p.id}`}>Edit</button><button className="btn outline small" onClick={()=>void clickDeleteProduct(p)} data-testid={`button-delete-product-${p.id}`}>Delete</button></div></td></tr>)}</tbody></table></div>:renderTableEmpty('products')}</section>;
    if(path==='/promoters/discover')return <><div className="surface"><div className="section-head"><div><h2 className="section-title">Match a product to creators</h2><div className="section-sub">Match results are recommendations, not verified audience guarantees.</div></div>{badge('Estimate')}</div><div className="form-grid"><div className="field"><label htmlFor="match-product">Choose product</label><select id="match-product" data-testid="select-match-product" value={chosenProduct?.id??''} onChange={e=>setProductForMatch(+e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div style={{alignSelf:'end',fontSize:12,color:'#718078'}}>Product-based discovery considers audience, locations, budget and recorded profile details.</div></div></div><section className="surface"><div className="section-head"><div><h2 className="section-title">Suggested matches</h2><div className="section-sub">Review missing profile information before reaching out.</div></div><button className="btn outline small" onClick={()=>openPromoter()} data-testid="button-add-promoter-record"><Plus size={13}/> Add manual record</button></div>{matchesQ.isLoading?<div className="loading-line"/>:matchesQ.isError?<div className="empty"><strong>Matching is unavailable</strong>Try again after checking the selected product.</div>:(matchesQ.data??[]).length?(matchesQ.data as PromoterMatch[]).map(m=><div className="data-row" key={m.promoter.id} data-testid={`match-${m.promoter.id}`}><div style={{minWidth:0}}><div className="row-name">{m.promoter.name} <span className="sub-cell" style={{display:'inline'}}>· {m.promoter.platform} · {m.promoter.contentCategory}</span></div><div className="row-meta">{m.reasons?.join(' · ')||'Match based on available profile data'}{m.missingInformation?.length?` · Missing: ${m.missingInformation.join(', ')}`:''}</div><div style={{display:'flex',gap:6,marginTop:8}}>{badge(m.promoter.verificationStatus)}{badge(m.promoter.isSample?'Sample':'Manual')}</div></div><div style={{textAlign:'right',whiteSpace:'nowrap'}}><div className="mono">{m.matchScore} match</div><div className="row-meta">Reach estimate {m.estimatedReach==null?'—':count(m.estimatedReach)}</div><button className={`btn small ${m.promoter.isShortlisted?'secondary':'outline'}`} style={{marginTop:8}} onClick={()=>void toggleShortlist(m.promoter)} data-testid={`button-shortlist-${m.promoter.id}`}>{m.promoter.isShortlisted?'Shortlisted':'Shortlist'}</button></div></div>):<div>{promoters.length?promoters.map(p=><div className="data-row" key={p.id} data-testid={`promoter-${p.id}`}><div><div className="row-name">{p.name} · {p.platform}</div><div className="row-meta">{count(p.followers)} followers · {p.contentCategory} · {p.audienceLocations.join(', ')||'Location not recorded'}</div>{badge(p.verificationStatus)}</div><div style={{display:'flex',gap:5}}><button className="btn outline small" onClick={()=>void toggleShortlist(p)} data-testid={`button-shortlist-${p.id}`}>{p.isShortlisted?'Remove':'Shortlist'}</button><button className="btn outline small" onClick={()=>openPromoter(p)} data-testid={`button-edit-promoter-${p.id}`}>Edit</button><button className="btn outline small" onClick={()=>void removePromoter(p)} data-testid={`button-delete-promoter-${p.id}`}>Delete</button></div></div>):renderTableEmpty('promoter profiles')}</div>}</section><section className="surface"><div className="section-head"><div><h2 className="section-title">Promoter records</h2><div className="section-sub">Maintain profile facts, source and verification status.</div></div><button className="btn outline small" onClick={()=>openPromoter()} data-testid="button-add-promoter"><Plus size={13}/> Add profile</button></div>{promoters.length?promoters.map(p=><div className="data-row" key={p.id} data-testid={`promoter-record-${p.id}`}><div><div className="row-name">{p.name} · {p.platform}</div><div className="row-meta">{p.contentCategory} · {count(p.followers)} followers · {p.dataSource}</div>{badge(p.verificationStatus)}</div><div style={{display:'flex',gap:6}}><button className="btn outline small" onClick={()=>openPromoter(p)} data-testid={`button-edit-promoter-record-${p.id}`}>Edit</button><button className="btn outline small" onClick={()=>void removePromoter(p)} data-testid={`button-delete-promoter-record-${p.id}`}>Delete</button></div></div>):renderTableEmpty('promoter records')}</section></>;
    if(path==='/promoters/compare'){const shortlist=promoters.filter(p=>p.isShortlisted||selectedPromoters.includes(p.id));return <section className="surface"><div className="section-head"><div><h2 className="section-title">Shortlisted profiles</h2><div className="section-sub">Side-by-side comparison shows recorded facts and unknowns together.</div></div><Link className="btn outline small" href="/promoters/discover">Discover more <ArrowUpRight size={13}/></Link></div>{shortlist.length?<div className="table-wrap"><table><thead><tr><th>Signal</th>{shortlist.map(p=><th key={p.id}>{p.name}</th>)}</tr></thead><tbody>{compareMetrics.map(([label,get])=><tr key={label}><td className="primary-cell">{label}</td>{shortlist.map(p=><td key={p.id}>{get(p)}</td>)}</tr>)}</tbody></table></div>:<div className="empty"><strong>Your shortlist is empty</strong>Add promoters from discovery to compare what is available.</div>}</section>}
    if(path==='/promoter-reviews')return <><div className="notice amber">Ratings and notes on this page are manually recorded feedback. They are not platform-verified claims.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Promoter feedback log</h2><div className="section-sub">A useful relationship history — not a public endorsement score.</div></div><button className="btn" onClick={()=>openForm({title:'Record promoter feedback',fields:[{key:'promoterId',label:'Promoter',type:'select',options:promoters.map(p=>`${p.id} · ${p.name}`)},input('rating','Rating (1–5)','number'),input('positiveFeedback','What worked','textarea','',undefined,true),input('negativeFeedback','What could improve','textarea','',undefined,true),input('source','Source')],submit:async v=>{await createPromoterReview.mutateAsync({data:{promoterId:+v.promoterId.split(' · ')[0],rating:+v.rating,positiveFeedback:v.positiveFeedback||'',negativeFeedback:v.negativeFeedback||'',source:v.source||'Manual'}});await refresh([getListPromoterReviewsQueryKey()]);showToast('Feedback saved')}})} data-testid="button-add-promoter-review"><Plus size={15}/> Add feedback</button></div>{promoterReviewsQ.isLoading?renderLoading():promoterReviewsQ.isError?renderError():(promoterReviewsQ.data??[]).length?<div className="table-wrap"><table><thead><tr><th>Promoter</th><th>Rating</th><th>What worked</th><th>To improve</th><th>Source</th><th>Added</th></tr></thead><tbody>{promoterReviewsQ.data?.map(r=><tr key={r.id} data-testid={`row-promoter-review-${r.id}`}><td className="primary-cell">{promoterName(r.promoterId)}</td><td>{r.rating}/5 <Star size={12} style={{display:'inline',color:'#bd8f42'}}/></td><td>{r.positiveFeedback||'—'}</td><td>{r.negativeFeedback||'—'}</td><td>{badge(r.isSample?'Sample':'Manual')}</td><td>{date(r.createdAt)}</td></tr>)}</tbody></table></div>:renderTableEmpty('promoter feedback')}</section></>;
    if(path==='/campaigns')return <section className="surface"><div className="section-head"><div><h2 className="section-title">Campaign agreements</h2><div className="section-sub">Draft → sent → accepted → active → completed</div></div><div className="search-input"><select aria-label="Filter campaign status" value={filter} onChange={e=>setFilter(e.target.value)} data-testid="select-campaign-filter" style={{border:0,background:'transparent'}}><option value="all">All statuses</option>{['draft','sent','accepted','active','completed'].map(x=><option key={x}>{x}</option>)}</select></div></div>{campaigns.length?<div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Product / promoter</th><th>Status & stage</th><th>Agreed price</th><th>Payment</th><th>Dates</th><th>Agreement</th><th>Actions</th></tr></thead><tbody>{campaigns.filter(c=>filter==='all'||c.status===filter).map(c=><tr key={c.id} data-testid={`row-campaign-${c.id}`}><td className="primary-cell">{c.name}<span className="sub-cell">{dataBadge(c.isSample)}</span></td><td>{productName(c.productId)}<span className="sub-cell">{promoterName(c.promoterId)}</span></td><td>{badge(c.status)}<span className="sub-cell">{c.currentStage}</span></td><td>{money(c.agreedPrice)}</td><td>{badge(c.paymentStatus)}</td><td>Submit {date(c.submissionDeadline)}<span className="sub-cell">Publish {date(c.publicationDeadline)}</span></td><td>{c.agreementObjectPath?<AgreementButton objectPath={c.agreementObjectPath} id={c.id}/>:badge('No PDF')}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}><button className="btn outline small" onClick={()=>startCampaign(c)} data-testid={`button-edit-campaign-${c.id}`}>Edit</button>{!c.agreementConfirmed&&<button className="btn small" onClick={()=>{const confirmed=window.confirm(`Confirm the agreement for ${c.name} at ${money(c.agreedPrice)}?`);if(confirmed)confirmAgreement.mutate({id:c.id,data:{agreedPrice:c.agreedPrice,confirmed:true,note:'Confirmed by workspace owner'}},{onSuccess:()=>{void refresh([getListCampaignsQueryKey()]);showToast('Agreement confirmed')}})}} data-testid={`button-confirm-agreement-${c.id}`}><Check size={12}/> Confirm</button>}<select aria-label={`Change status for ${c.name}`} data-testid={`select-campaign-status-${c.id}`} value={c.status} onChange={e=>updateCampaign.mutate({id:c.id,data:{status:e.target.value as 'draft'|'sent'|'accepted'|'active'|'completed'}},{onSuccess:()=>{void refresh([getListCampaignsQueryKey()]);showToast('Campaign status updated')}})} style={{maxWidth:100,fontSize:10,border:'1px solid #dcd9cd',borderRadius:6}}>{['draft','sent','accepted','active','completed'].map(s=><option key={s}>{s}</option>)}</select><label className="btn outline small" htmlFor={`agreement-${c.id}`} data-testid={`button-upload-agreement-${c.id}`}><Upload size={12}/> PDF<input id={`agreement-${c.id}`} type="file" accept="application/pdf,.pdf" hidden onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const fileInput=e.currentTarget;if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){showToast('Only PDF documents are accepted');fileInput.value='';return}try{setUploadState(`Uploading ${file.name}…`);const meta=await requestUpload.mutateAsync({data:{name:file.name,size:file.size,contentType:'application/pdf'}});const response=await fetch(meta.uploadURL,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:file});if(!response.ok)throw new Error(`Upload failed (${response.status})`);await updateCampaign.mutateAsync({id:c.id,data:{agreementObjectPath:meta.objectPath}});await refresh([getListCampaignsQueryKey()]);showToast('Protected agreement PDF uploaded')}catch(err){showToast(err instanceof Error?err.message:'Upload failed')}finally{setUploadState('');fileInput.value=''}}}/></label><button className="btn outline small" onClick={()=>{if(window.confirm(`Delete campaign ${c.name}?`))deleteCampaign.mutate({id:c.id},{onSuccess:()=>{void refresh([getListCampaignsQueryKey()]);showToast('Campaign deleted')}})}} data-testid={`button-delete-campaign-${c.id}`}>Delete</button></div></td></tr>)}</tbody></table></div>:renderTableEmpty('campaigns')}{uploadState&&<div className="notice" style={{marginTop:12}}>{uploadState}</div>}</section>;
    if(path==='/videos')return <><div className="surface"><div className="section-head"><div><h2 className="section-title">Choose a campaign</h2><div className="section-sub">Timeline actions are recorded against this campaign.</div></div>{activeCampaign&&badge(activeCampaign.currentStage)}</div><select data-testid="select-timeline-campaign" value={activeCampaign?.id??''} onChange={e=>setSelectedCampaign(+e.target.value)} style={{padding:10,border:'1px solid #ddd9cd',borderRadius:7,background:'#fffdf7',minWidth:280}}>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} — {c.status}</option>)}</select></div><section className="surface"><div className="section-head"><div><h2 className="section-title">Creative and publishing timeline</h2><div className="section-sub">Submission, revision, approval and publication notes.</div></div><button className="btn" disabled={!activeCampaign} onClick={()=>openForm({title:'Add timeline event',fields:[{key:'stage',label:'Stage',type:'select',options:['brief','submission','revision','approval','publication']},{key:'status',label:'Status',type:'select',options:['pending','in_progress','completed','overdue','revision_requested','approved','rejected']},input('note','Notes','textarea','Describe the change',undefined,true),input('evidenceUrl','Evidence URL','url'),input('postUrl','Published post URL','url'),input('deadline','Deadline','date'),input('revisionReason','Revision reason'),input('approvalDetails','Approval details')],submit:async v=>{await createTimeline.mutateAsync({id:activeCampaign!.id,data:{stage:v.stage,status:v.status as 'pending'|'in_progress'|'completed'|'overdue'|'revision_requested'|'approved'|'rejected',note:v.note, evidenceUrl:v.evidenceUrl||null,postUrl:v.postUrl||null,deadline:v.deadline||null,revisionReason:v.revisionReason||null,approvalDetails:v.approvalDetails||null}});await refresh([getListCampaignTimelineQueryKey(activeCampaign!.id)]);showToast('Timeline event saved')}})} data-testid="button-add-timeline"><Plus size={14}/> Add event</button></div>{timelineQ.isLoading?<div className="loading-line"/>:timelineQ.isError?<div className="empty"><strong>Timeline unavailable</strong>Check the campaign and try again.</div>:(timelineQ.data??[]).length?<div className="timeline">{timelineQ.data?.map((t:TimelineEntry)=><div className="timeline-item" key={t.id} data-testid={`timeline-${t.id}`}><div className="row-name">{t.stage} {badge(t.status)} {dataBadge(t.isSample)}</div><div className="row-meta">{date(t.occurredAt)}{t.deadline?` · Due ${date(t.deadline)}`:''}</div><div style={{fontSize:12,marginTop:7}}>{t.note}</div>{t.revisionReason&&<div className="row-meta">Revision: {t.revisionReason}</div>}{t.approvalDetails&&<div className="row-meta">Approval: {t.approvalDetails}</div>}{t.postUrl&&<a href={t.postUrl} target="_blank" rel="noreferrer" className="row-meta">Published post <ArrowUpRight size={11}/></a>}</div>)}</div>:renderTableEmpty('timeline events')}</section></>;
    if(path==='/promotion-analytics')return <><div className="notice amber" style={{marginBottom:15}}>Reach, views, impressions, clicks and interest are promotion signals. They are <strong>not orders or sales</strong>. Only recorded orders count as sales.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Recorded campaign metrics</h2><div className="section-sub">Source and verification status remain visible on every record.</div></div></div>{metricsQ.isLoading?renderLoading():metricsQ.isError?renderError():(metricsQ.data??[]).length?<div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Date</th><th>Reach</th><th>Views</th><th>Clicks</th><th>Interest</th><th>Cart</th><th>Attributed orders</th><th>Source</th><th>Data</th></tr></thead><tbody>{metricsQ.data?.map((m:CampaignMetric)=><tr key={m.id} data-testid={`row-metric-${m.id}`}><td className="primary-cell">{campaignName(m.campaignId)}</td><td>{date(m.metricDate)}</td><td>{count(m.reach)}</td><td>{count(m.views)}</td><td>{count(m.linkClicks)}</td><td>{count(m.interestedCustomers)}</td><td>{count(m.addToCart)}</td><td>{count(m.attributedOrders)}</td><td>{m.source}</td><td>{badge(m.isSample?'Sample':m.verified?'Verified':'Manual')}</td></tr>)}</tbody></table></div>:renderTableEmpty('promotion metrics')}</section></>;
    if(path==='/links')return <><div className="notice" style={{marginBottom:15}}>Link visits can be observed; they are not proof of purchase. Destination links are the merchant-provided URLs.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Campaign tracking links</h2><div className="section-sub">Visits use the workspace redirect endpoint.</div></div></div>{linksQ.isLoading?renderLoading():linksQ.isError?renderError():(linksQ.data??[]).length?<div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Promoter</th><th>Destination</th><th>Recorded clicks</th><th>Created</th><th>Visit</th></tr></thead><tbody>{linksQ.data?.map((l:TrackingLink)=><tr key={l.id} data-testid={`row-tracking-link-${l.id}`}><td className="primary-cell">{campaignName(l.campaignId)}</td><td>{promoterName(l.promoterId)}</td><td style={{maxWidth:270,overflow:'hidden',textOverflow:'ellipsis'}}>{l.destinationUrl}</td><td>{count(l.clicks)}</td><td>{date(l.createdAt)}</td><td><a className="btn outline small" href={getVisitTrackingLinkUrl(l.code)} target="_blank" rel="noreferrer" data-testid={`link-visit-${l.id}`}>Open <ArrowUpRight size={12}/></a></td></tr>)}</tbody></table></div>:renderTableEmpty('tracking links')}</section></>;
    if(path==='/orders')return <><input id="csv-import" type="file" accept=".csv,text/csv" hidden data-testid="input-csv-import" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const text=await file.text();const lines=text.split(/\r?\n/).filter(Boolean),heads=lines.shift()?.split(',').map(x=>x.trim())??[];const rows=lines.map(line=>{const cells=line.split(',').map(x=>x.trim());const o=Object.fromEntries(heads.map((h,i)=>[h,cells[i]??'']));return {...o,productId:+o.productId,quantity:+o.quantity,unitPrice:+o.unitPrice,discount:+(o.discount||0),paymentStatus:o.paymentStatus||'pending',status:o.status||'placed',source:o.source||'CSV import'} as never});const res=await importOrders.mutateAsync({data:{rows}});await commonRefresh();showToast(`Import finished · ${res.imported} imported, ${res.failed} failed`)}catch(err){showToast(err instanceof Error?err.message:'Could not import CSV')}finally{e.currentTarget.value=''}}}/><div className="notice" style={{marginBottom:14}}>Use only privacy-safe customer references; do not include customer names in imports. Imported orders are recorded manually and attribution depends on the supplied campaign and promoter fields.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Order ledger</h2><div className="section-sub">{orders.length} recorded orders · only these count toward sales</div></div><select aria-label="Filter order status" data-testid="select-order-filter" value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:8,border:'1px solid #ddd9cd',borderRadius:7,background:'transparent'}}><option value="all">All statuses</option>{['placed','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned'].map(s=><option key={s}>{s}</option>)}</select></div>{orders.length?<div className="table-wrap"><table><thead><tr><th>Order</th><th>Date / product</th><th>Variant / quantity</th><th>Total</th><th>Attribution</th><th>Destination</th><th>Delivery</th><th>Data</th><th>Actions</th></tr></thead><tbody>{orders.filter(o=>filter==='all'||o.status===filter).map(o=><tr key={o.id} data-testid={`row-order-${o.id}`}><td className="primary-cell">{o.orderCode}<span className="sub-cell">{o.customerRef||'No customer reference'}</span></td><td>{date(o.orderDate)}<span className="sub-cell">{productName(o.productId)}</span></td><td>{o.variant||'—'} · {o.quantity}</td><td>{money(o.totalAmount)}</td><td>{o.campaignId?campaignName(o.campaignId):o.source}<span className="sub-cell">{o.promoterId?promoterName(o.promoterId):'No promoter'}</span></td><td>{[o.city,o.state,o.pinCode].filter(Boolean).join(', ')||'—'}</td><td>{badge(o.status)}<span className="sub-cell">{o.courier||''} {o.trackingNumber||''}</span></td><td>{dataBadge(o.isSample)}</td><td><div style={{display:'flex',gap:5}}><button className="btn outline small" onClick={()=>startOrder(o)} data-testid={`button-edit-order-${o.id}`}>Edit</button><button className="btn outline small" onClick={()=>void clickDeleteOrder(o)} data-testid={`button-delete-order-${o.id}`}>Delete</button></div></td></tr>)}</tbody></table></div>:renderTableEmpty('orders')}</section></>;
    if(path==='/locations'){const loc=locationsQ.data;if(locationsQ.isLoading)return renderLoading();if(locationsQ.isError)return renderError();return <><div className="notice" style={{marginBottom:14}}>Location summaries are aggregated from order records. Delivery outcomes are recorded workflow status, not courier-verified unless your source confirms them.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Location and delivery picture</h2><div className="section-sub">Interest signals shown separately from order outcomes.</div></div>{badge(orders.some(o=>o.isSample)?'Sample':'Recorded')}</div>{loc?.locations?.length?<div className="table-wrap"><table><thead><tr><th>Location</th><th>Orders</th><th>Units</th><th>Revenue</th><th>Delivered</th><th>Pending</th><th>Failed</th><th>Returns</th><th>Interest</th></tr></thead><tbody>{loc.locations.map((l,i)=><tr key={`${l.city}-${i}`} data-testid={`row-location-${i}`}><td className="primary-cell">{[l.city,l.district,l.state,l.pinCode].filter(Boolean).join(', ')}</td><td>{count(l.orders)}</td><td>{count(l.units)}</td><td>{money(l.revenue)}</td><td>{count(l.delivered)}</td><td>{count(l.pending)}</td><td>{count(l.failed)}</td><td>{count(l.returned)}</td><td>{count(l.interested)}</td></tr>)}</tbody></table></div>:renderTableEmpty('location records')}</section></>}
    if(path==='/reviews'){const reviews=customerReviewsQ.data??[];return <><div className="notice" style={{marginBottom:14}}>Reviews should be linked to delivered orders. Store no customer names. Ratings reflect manually collected feedback unless explicitly verified by your data source.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Delivered-order feedback</h2><div className="section-sub">{reviews.length} review records collected</div></div></div>{customerReviewsQ.isLoading?renderLoading():customerReviewsQ.isError?renderError():reviews.length?<div className="table-wrap"><table><thead><tr><th>Product / variant</th><th>Rating</th><th>Quality</th><th>Color fit</th><th>Value</th><th>Delivery</th><th>Recommend</th><th>Feedback</th><th>Data</th></tr></thead><tbody>{reviews.map((r:CustomerReview)=><tr key={r.id} data-testid={`row-customer-review-${r.id}`}><td className="primary-cell">{productName(r.productId)}<span className="sub-cell">{r.variant} · {r.location||'Location not recorded'}</span></td><td>{r.rating}/5</td><td>{r.qualityRating}/5</td><td>{r.colorMatches?'Matches':'Mismatch'}</td><td>{r.valueRating}/5</td><td>{r.deliveryRating}/5</td><td>{r.recommend?'Yes':'No'} · rebuy {r.buyAgain?'yes':'no'}</td><td>{r.comments||'—'}</td><td>{dataBadge(r.isSample)}</td></tr>)}</tbody></table></div>:renderTableEmpty('customer reviews')}</section></>}
    if(path==='/demand'){const d=demandQ.data;if(demandQ.isLoading)return renderLoading();if(demandQ.isError)return renderError();const blocks=[['Product demand',d?.productDemand],['Location demand',d?.locationDemand],['Variant demand',d?.variantDemand]] as const;return <><div className="notice amber" style={{marginBottom:15}}>Demand indicators may include estimated interest. Interest is not purchase intent and is not an order. Stock recommendations are guidance, not automated inventory changes. {badge(d?.isEstimate?'Estimate':'Recorded')}</div><div className="grid-two">{blocks.map(([name,rows])=><section className="surface" key={name}><div className="section-head"><div><h2 className="section-title">{name}</h2><div className="section-sub">Interest alongside orders and revenue</div></div></div>{rows?.length?<div className="bar-list">{rows.map((m,i)=><div className="bar-row" key={`${m.name}-${i}`} data-testid={`demand-${name}-${i}`}><span>{m.name}</span><div className="bar-track"><div className="bar-fill" style={{width:`${Math.min(100,Math.max(5,m.interest/(Math.max(...rows.map(x=>x.interest),1))*100))}%`}}/></div><span className="mono">{count(m.interest)} interest · {count(m.orders)} orders</span></div>)}</div>:<div className="empty"><strong>No signal recorded</strong>As records arrive, demand segments appear here.</div>}</section>)}</div><div className="split" style={{marginTop:15}}><section className="surface"><h2 className="section-title">High interest, low purchase</h2>{d?.highInterestLowPurchase?.length?d.highInterestLowPurchase.map(x=><div className="data-row" key={x}><span>{x}</span>{badge('Estimate')}</div>):<p className="section-sub">No segment meets this condition in available records.</p>}</section><section className="surface"><h2 className="section-title">Low stock products</h2>{d?.lowStockProducts?.length?d.lowStockProducts.map(x=><div className="data-row" key={x}><span>{x}</span>{badge('Recorded')}</div>):<p className="section-sub">No low-stock products flagged.</p>}</section></div><section className="surface"><h2 className="section-title">Stock recommendations</h2>{d?.recommendations?.map((x,i)=><div className="data-row" key={i}><span>{x}</span>{badge('Estimate')}</div>)}</section></>}
    if(path==='/financials'){const f=financialQ.data;if(financialQ.isLoading)return renderLoading();if(financialQ.isError)return renderError();if(!f)return renderLoading();const stats=[['Recorded revenue',money(f.totalRevenue,f.currency)],['Net sales',money(f.netSales,f.currency)],['Expenses',money(f.totalExpenses,f.currency)],['Net profit',money(f.netProfit,f.currency)],['Profit margin',f.profitMargin==null?'—':`${f.profitMargin.toFixed(1)}%`],['Average order',f.averageOrderValue==null?'—':money(f.averageOrderValue,f.currency)],['Campaign ROI',f.averageCampaignRoi==null?'—':`${f.averageCampaignRoi.toFixed(1)}%`],['Units delivered',count(f.unitsDelivered)]];const components:Array<[string,number]>=[['Gross order value',f.grossOrderValue],['Refunds',f.refunds],['Collected payments',f.collectedPayments],['Product cost',f.productCost],['Promoter cost',f.promoterCost],['Other costs',f.otherCosts],['Ordered units',f.unitsOrdered],['Returned units',f.returnedUnits]];const segments:Array<[string,typeof f.byProduct]>=[['By product',f.byProduct],['By promoter',f.byPromoter],['By campaign',f.byCampaign],['By location',f.byLocation]];return <><div className="notice amber" style={{marginBottom:14}}>Every financial value below is server-derived from recorded orders, returns, product costs and expenses. Views and clicks never count as sales.</div><div className="stat-grid">{stats.map(([l,v])=><div className="stat-card" key={l}><div className="stat-label">{l}</div><div className="stat-value" style={{fontSize:22}}>{v}</div><div className="stat-foot">{badge('Recorded')}</div></div>)}</div><div className="grid-two"><section className="surface"><div className="section-head"><div><h2 className="section-title">Financial components</h2><div className="section-sub">Business totals computed from current records</div></div></div>{components.map(([l,v])=><div className="data-row" key={l}><span className="row-name">{l}</span><span className="mono">{l.toLowerCase().includes('units')?count(v):money(v,f.currency)}</span></div>)}</section><section className="surface"><div className="section-head"><div><h2 className="section-title">Calculation notes</h2><div className="section-sub">Server-provided formulas</div></div></div>{f.formulas.map((formula,i)=><div className="data-row" key={i}><span className="mono">{formula}</span></div>)}{!f.formulas.length&&<p className="section-sub">No formulas were supplied.</p>}</section></div>{segments.map(([label,rows])=><section className="surface" key={label}><h2 className="section-title">{label}</h2>{rows.length?<div className="table-wrap"><table><thead><tr><th>Record</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>ROI</th></tr></thead><tbody>{rows.map((m,i)=><tr key={`${m.name}-${i}`}><td className="primary-cell">{m.name}</td><td>{money(m.revenue,f.currency)}</td><td>{money(m.expenses,f.currency)}</td><td>{money(m.profit,f.currency)}</td><td>{m.roi==null?'—':`${m.roi.toFixed(1)}%`}</td></tr>)}</tbody></table></div>:<p className="section-sub" style={{marginTop:10}}>No records yet.</p>}</section>)}</>}
    if(path==='/insights')return <><section className="surface"><div className="section-head"><div><h2 className="section-title">Ask a business question</h2><div className="section-sub">Answers use available business records; missing data stays missing.</div></div><Sparkles size={17} color="#bb775e"/></div><div className="field"><label htmlFor="business-question">Your question</label><textarea id="business-question" data-testid="input-business-question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Which products have the strongest recorded orders relative to promotion spend?" maxLength={2000}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:12,alignItems:'center'}}><span className="section-sub">Answers may be rules-based or AI-assisted; limitations are shown.</span><button className="btn" disabled={!question.trim()||askInsight.isPending} onClick={()=>askInsight.mutate({data:{question:question.trim()}},{onSuccess:r=>setAnswer(`${r.answer}\n\nSource: ${r.source} · ${date(r.generatedAt)}\n${r.limitations.join(' · ')}`),onError:()=>showToast('Unable to generate an answer')})} data-testid="button-ask-insight">{askInsight.isPending?'Thinking…':'Ask question'} <ArrowRight size={14}/></button></div></section>{answer&&<section className="surface" data-testid="insight-answer"><div className="section-head"><h2 className="section-title">Your answer</h2><button className="icon-button" onClick={()=>setAnswer('')} aria-label="Dismiss answer"><X size={15}/></button></div><div style={{fontSize:13,lineHeight:1.75,whiteSpace:'pre-wrap'}}>{answer}</div></section>}<section className="surface"><h2 className="section-title">Try asking</h2><div className="grid-three" style={{marginTop:14}}>{['Which products have interest but few recorded orders?','What is my recorded profit after promotion costs?','Where are delivery failures appearing?'].map(q=><button key={q} className="btn outline" style={{justifyContent:'flex-start',textAlign:'left',whiteSpace:'normal'}} onClick={()=>setQuestion(q)} data-testid={`button-suggestion-${q.slice(0,10)}`}>{q}</button>)}</div></section></>;
    if(path==='/reports'){const allRows=path==='/reports'?orders:[];const reportRows=allRows.filter(o=>filter==='all'||o.status===filter).filter(o=>!searchTerm||`${o.orderCode} ${productName(o.productId)} ${o.city}`.toLowerCase().includes(searchTerm.toLowerCase()));const csv=()=>{const headers=['orderCode','orderDate','product','variant','quantity','unitPrice','discount','totalAmount','status','paymentStatus','campaignId','promoterId','source','city','state','deliveryStatus'];const rows=reportRows.map(o=>[o.orderCode,o.orderDate,productName(o.productId),o.variant,o.quantity,o.unitPrice,o.discount,o.totalAmount,o.status,o.paymentStatus,o.campaignId??'',o.promoterId??'',o.source,o.city??'',o.state??'',o.deliveryStatus]);const text=[headers,...rows].map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download='creatortrust-orders.csv';a.click();URL.revokeObjectURL(a.href)};return <><div className="notice" style={{marginBottom:14}}>Exports contain recorded orders only and avoid customer names. Reports do not convert clicks or interest into sales.</div><section className="surface"><div className="section-head"><div><h2 className="section-title">Order report</h2><div className="section-sub">Filter recorded order details before export.</div></div><div style={{display:'flex',gap:8}}><button className="btn outline small" onClick={()=>window.print()} data-testid="button-print-report"><FileBarChart2 size={13}/> Print</button><button className="btn small" onClick={csv} data-testid="button-export-csv"><Download size={13}/> Export CSV</button></div></div><div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}><input className="search-input" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search order, product or city" aria-label="Search report" data-testid="input-report-search"/><select className="search-input" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter report by status" data-testid="select-report-status"><option value="all">All order statuses</option>{['placed','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned'].map(s=><option key={s}>{s}</option>)}</select></div>{reportRows.length?<div className="table-wrap"><table><thead><tr><th>Order</th><th>Date</th><th>Product</th><th>Units</th><th>Revenue</th><th>Campaign</th><th>Status</th><th>Location</th></tr></thead><tbody>{reportRows.map(o=><tr key={o.id} data-testid={`report-order-${o.id}`}><td>{o.orderCode}</td><td>{date(o.orderDate)}</td><td>{productName(o.productId)}</td><td>{o.quantity}</td><td>{money(o.totalAmount)}</td><td>{o.campaignId?campaignName(o.campaignId):'—'}</td><td>{o.status}</td><td>{[o.city,o.state].filter(Boolean).join(', ')||'—'}</td></tr>)}</tbody></table></div>:renderTableEmpty('orders matching these filters')}</section></>}
    if(path==='/settings')return <div className="grid-two"><section className="surface"><div className="section-head"><div><h2 className="section-title">Profile</h2><div className="section-sub">Workspace identity</div></div><div className="user-dot">{name.slice(0,1).toUpperCase()}</div></div><div className="data-row"><span className="row-name">Signed-in user</span><span>{name}</span></div><div className="data-row"><span className="row-name">Workspace mode</span><span>{dashboardQ.data?.isSampleWorkspace?'Sample workspace':'Business records'}</span></div></section><section className="surface"><div className="section-head"><div><h2 className="section-title">Data handling</h2><div className="section-sub">Clarity about source, limitations and calculations</div></div><ShieldCheck size={18}/></div><div className="notice amber">Sample records are visibly labeled and must not be presented as live business results. Promoter audience and performance details are only verified when explicitly marked verified by a trustworthy data source.</div><div className="data-row"><span>Estimated demand</span>{badge('Estimate')}</div><div className="data-row"><span>User-entered campaign and order details</span>{badge('Manual')}</div><div className="data-row"><span>Platform-confirmed information</span>{badge('Verified')}</div></section><section className="surface"><div className="section-head"><div><h2 className="section-title">Workflow notes</h2><div className="section-sub">A shared source of truth, not a replacement for due diligence.</div></div></div>{['Promotion reach, views, clicks and interest are not orders.','Only recorded orders count as sales; financial calculations are server-derived.','Do not store customer names. Use privacy-safe customer references.','Agreement PDFs are uploaded to protected storage and linked to a campaign.','Creator profiles, deliverables and quotes are not verified unless marked as verified.'].map(x=><div className="data-row" key={x}><span>{x}</span><Check size={14} color="#43806d"/></div>)}</section><section className="surface"><h2 className="section-title">Business data sources</h2><p className="section-sub">Profile and performance records should retain their source label. The app does not claim that unverified creator facts are accurate.</p><div style={{marginTop:15}}><button className="btn outline" onClick={()=>setPath('/promoters/discover')} data-testid="button-review-promoters">Review promoter data <ArrowUpRight size={13}/></button></div></section></div>;
    return <div className="empty"><strong>Page not found</strong>Choose a workspace module from the navigation.</div>;
  };

  const activeTitle=title[0];
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">ct</div><div><div className="brand-name">CreatorTrust</div><div className="brand-caption">promotion workspace</div></div></div>{navGroups.map(group=><div className="nav-group" key={group.name}><div className="nav-label">{group.name}</div>{group.items.map(([href,label,Icon])=><Link href={href} key={href} className={`nav-link ${path===href?'active':''}`} data-testid={`nav-${href==='/'?'overview':href.slice(1).replaceAll('/','-')}`}><Icon size={16}/>{label}</Link>)}</div>)}<div className="sidebar-foot"><div className="sample-note">Sample data is labeled. Recorded sales are kept separate from estimated attention signals.</div><div className="user-chip"><div className="user-dot">{name.slice(0,1).toUpperCase()}</div><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</span></div></div></aside>
    <main className="main-area"><header className="topbar"><div style={{display:'flex',alignItems:'center',gap:10}}><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(!mobileOpen)} aria-label="Open navigation" data-testid="button-mobile-menu"><Menu size={17}/></button><div className="crumb">Workspace <ChevronRight size={12} style={{display:'inline',verticalAlign:'middle'}}/> <span style={{color:'#3c6259'}}>{activeTitle}</span></div></div><div className="top-actions"><div className="top-tag">RECORDS FIRST · TRUST ALWAYS</div><button className="icon-button" title={`${notifications.length} notifications`} onClick={()=>setPath('/')} data-testid="button-notifications"><Bell size={16}/></button><button className="icon-button" title="Sign out" onClick={onLogout} data-testid="button-sign-out"><ArrowRight size={15}/></button></div></header>{mobileOpen&&<nav className="mobile-nav" style={{top:58,bottom:'auto',overflowX:'auto',justifyContent:'flex-start',gap:15,padding:'10px 13px'}}>{navGroups.flatMap(g=>g.items).map(([href,label,Icon])=><Link key={href} href={href} onClick={()=>setMobileOpen(false)} className={path===href?'active':''}><Icon/><span>{label}</span></Link>)}</nav>}<div className="content"><div className="page-heading"><div><div className="eyebrow">CreatorTrust · Owner workspace</div><h1 className="page-title">{title[0]}</h1><p className="page-desc">{title[2]}</p></div>{headerActions()}</div>{renderPage()}{path==='/financials'&&<ExpenseLog expenses={expensesQ.data??[]} loading={expensesQ.isLoading} error={expensesQ.isError} onEdit={editExpenseRecord} onDelete={x=>void removeExpense(x)}/>}</div></main><nav className="mobile-nav">{[['/','Home',Home],['/products','Products',Package],['/promoters/discover','Discover',Search],['/campaigns','Campaigns',FileCheck2],['/orders','Orders',ShoppingBag]].map(([href,label,Icon])=><Link href={href as string} key={href as string} className={path===href?'active':''}><Icon size={17}/><span>{label as string}</span></Link>)}</nav>
    {toast&&<div role="status" className="notice" style={{position:'fixed',right:20,bottom:24,zIndex:60,boxShadow:'0 8px 25px rgba(21,39,38,.15)'}} data-testid="toast-status">{toast}</div>}
    {form&&<Modal key={form.title} form={form} onClose={()=>setForm(null)} onSubmit={saveForm}/>}
  </div>;
}

function AgreementButton({objectPath,id}:{objectPath:string;id:number}) {
  const file=useGetStorageObject(objectPath,{query:{queryKey:getGetStorageObjectQueryKey(objectPath)}});
  return <button className="btn outline small" disabled={file.isLoading||file.isError} onClick={()=>{if(file.data){const url=URL.createObjectURL(file.data);window.open(url,'_blank','noopener');window.setTimeout(()=>URL.revokeObjectURL(url),60000)}}} data-testid={`button-read-agreement-${id}`}>{file.isLoading?'Loading…':file.isError?'Unavailable':'View PDF'}</button>;
}
function ExpenseLog({expenses,loading,error,onEdit,onDelete}:{expenses:Expense[];loading:boolean;error:boolean;onEdit:(x:Expense)=>void;onDelete:(x:Expense)=>void}) {
  return <section className="surface"><div className="section-head"><div><h2 className="section-title">Expense records</h2><div className="section-sub">Manual costs included in server-derived financials.</div></div></div>{loading?<div className="loading-line"/>:error?<div className="empty"><strong>Expense records unavailable</strong>Retry after checking your connection.</div>:expenses.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Product / campaign</th><th>Notes</th><th>Source</th><th>Actions</th></tr></thead><tbody>{expenses.map(x=><tr key={x.id} data-testid={`row-expense-${x.id}`}><td>{date(x.expenseDate)}</td><td className="primary-cell">{x.category}</td><td>{money(x.amount)}</td><td>{x.productId??'—'} / {x.campaignId??'—'}</td><td>{x.notes||'—'}</td><td>{badge(x.isSample?'Sample':'Manual')}</td><td><div style={{display:'flex',gap:5}}><button className="btn outline small" onClick={()=>onEdit(x)} data-testid={`button-edit-expense-${x.id}`}>Edit</button><button className="btn outline small" onClick={()=>onDelete(x)} data-testid={`button-delete-expense-${x.id}`}>Delete</button></div></td></tr>)}</tbody></table></div>:<div className="empty"><strong>No expense records</strong>Record promoter, packaging, shipping and other costs to see their impact on profit.</div>}</section>;
}

function Modal({form,onClose,onSubmit}:{form:FormState;onClose:()=>void;onSubmit:(v:Record<string,string>)=>void}) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(form.fields.map(f=>{const initial=form.initial?.[f.key];const value=initial==null?'':Array.isArray(initial)?initial.join(', '):String(initial);return [f.key,value]})));
  const [busy,setBusy]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);try{await onSubmit(values)}finally{setBusy(false)}};
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="section-head"><div><h2 className="modal-title" id="modal-title">{form.title}</h2><div className="section-sub">Fields are stored with the source and status you provide.</div></div><button className="icon-button" onClick={onClose} aria-label="Close form" data-testid="button-close-form"><X size={16}/></button></div><form onSubmit={submit}><div className="form-grid">{form.fields.map(f=><div className={`field ${f.full?'full':''}`} key={f.key}><label htmlFor={`field-${f.key}`}>{f.label}</label>{f.type==='textarea'?<textarea id={`field-${f.key}`} data-testid={`input-${f.key}`} required={f.required} value={values[f.key]??''} onChange={e=>setValues({...values,[f.key]:e.target.value})} placeholder={f.placeholder}/>:f.type==='select'?<select id={`field-${f.key}`} data-testid={`select-${f.key}`} required={f.required} value={values[f.key]??''} onChange={e=>setValues({...values,[f.key]:e.target.value})}><option value="">Choose…</option>{(f.options??[]).map(o=>{const [v]=o.split(' · ');return <option key={o} value={o}>{o}</option>})}</select>:<input id={`field-${f.key}`} data-testid={`input-${f.key}`} type={f.type??'text'} required={f.required} value={values[f.key]??''} onChange={e=>setValues({...values,[f.key]:e.target.value})} placeholder={f.placeholder} step={f.type==='number'?'any':undefined}/>}</div>)}</div><div className="form-actions"><button type="button" className="btn outline" onClick={onClose} data-testid="button-cancel-form">Cancel</button><button type="submit" className="btn" disabled={busy} data-testid="button-save-form">{busy?'Saving…':'Save record'}</button></div></form></div></div>;
}

function GuestDashboard() {
  const campaigns = [
    {
      name: "Tote launch — demo",
      product: "Handloom Travel Tote",
      creator: "Demo creator 01",
      stage: "Content submitted",
      deliverables: "1 short video · 2 stories",
      fee: "₹9,000",
    },
    {
      name: "Cup review — demo",
      product: "Ceramic Matcha Cup",
      creator: "Demo creator 03",
      stage: "Published",
      deliverables: "1 short video · 1 post",
      fee: "₹6,500",
    },
  ];

  const creators = [
    {
      name: "Demo creator 01",
      platform: "Instagram",
      category: "Lifestyle",
      followers: "42,000",
      engagement: "3.8%",
      source: "Fictional demo profile",
    },
    {
      name: "Demo creator 02",
      platform: "YouTube",
      category: "Home & living",
      followers: "68,000",
      engagement: "4.2%",
      source: "Fictional demo profile",
    },
    {
      name: "Demo creator 03",
      platform: "Instagram",
      category: "Food & drink",
      followers: "19,500",
      engagement: "5.1%",
      source: "Fictional demo profile",
    },
  ];

  const matches = [
    {
      product: "Handloom Travel Tote",
      creator: "Demo creator 01",
      fit: "92%",
      reasons: "Daily-carry interests · Delhi and Mumbai audience",
    },
    {
      product: "Ceramic Matcha Cup",
      creator: "Demo creator 02",
      fit: "89%",
      reasons: "Homeware and tea interests · Pune and Bengaluru audience",
    },
    {
      product: "Ceramic Matcha Cup",
      creator: "Demo creator 03",
      fit: "81%",
      reasons: "Tea and kitchen interests · Pune audience",
    },
  ];

  const analytics = [
    { label: "Recorded reach", value: "18,400", fill: "86%" },
    { label: "Video views", value: "8,300", fill: "68%" },
    { label: "Tracked link clicks", value: "420", fill: "42%" },
    { label: "Sample attributed orders", value: "12", fill: "28%" },
  ];

  return (
    <div className="app-shell" data-testid="guest-dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ct</div>
          <div>
            <div className="brand-name">CreatorTrust</div>
            <div className="brand-caption">promotion workspace</div>
          </div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Guest demo</div>
          <a className="nav-link" href="#guest-campaigns"><FileCheck2 size={16}/>Brand Campaigns</a>
          <a className="nav-link" href="#guest-creators"><Users size={16}/>Creator Profiles</a>
          <a className="nav-link" href="#guest-matching"><Search size={16}/>Brand-Creator Matching</a>
          <a className="nav-link" href="#guest-analytics"><ChartNoAxesCombined size={16}/>Campaign Analytics</a>
        </div>
        <div className="sidebar-foot">
          <div className="sample-note">All demo records and performance figures are fictional sample data.</div>
          <Link href="/" className="btn secondary small" style={{marginTop:14,width:'100%'}} data-testid="link-demo-sign-in">
            Return to sign in
          </Link>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumb">CreatorTrust / Guest demo</div>
          <div className="top-actions">
            <span className="badge sample">Read-only sample</span>
            <Link href="/" className="btn outline small" data-testid="link-demo-sign-in-top">
              Sign in
            </Link>
          </div>
        </header>

        <div className="content">
          <div className="notice amber" style={{marginBottom:18}} data-testid="sample-data-disclosure">
            <strong>Demo mode — fictional sample data.</strong> Creator profiles, match scores, campaign details, and analytics below are illustrative. No social, store, or courier account is connected.
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">CREATORTRUST AI · GUEST WORKSPACE</div>
              <h1 className="page-title">Brand and creator overview</h1>
              <p className="page-desc">Explore the campaign workflow with sample profiles, illustrative matches, and clearly labeled sample analytics.</p>
            </div>
            <span className="badge sample">Guest demo</span>
          </div>

          <nav aria-label="Demo dashboard sections" style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>
            <a className="btn secondary small" href="#guest-campaigns">Brand Campaigns</a>
            <a className="btn secondary small" href="#guest-creators">Creator Profiles</a>
            <a className="btn secondary small" href="#guest-matching">Brand-Creator Matching</a>
            <a className="btn secondary small" href="#guest-analytics">Campaign Analytics</a>
          </nav>

          <div className="stat-grid">
            {[
              ["Brand campaigns", "2", "Fictional sample records"],
              ["Creator profiles", "3", "Fictional demo profiles"],
              ["Illustrative matches", "3", "Not independently verified"],
              ["Sample campaign fees", "₹15,500", "Example values only"],
            ].map(([label, value, foot]) => (
              <div className="stat-card" key={label}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
                <div className="stat-foot">{foot}</div>
              </div>
            ))}
          </div>

          <section className="surface guest-demo-section" id="guest-campaigns" data-testid="demo-brand-campaigns">
            <div className="section-head">
              <div>
                <h2 className="section-title">Brand Campaigns</h2>
                <div className="section-sub">Sample campaign scope, creator, deliverables, and stage.</div>
              </div>
              <span className="badge sample">Sample</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Campaign</th><th>Product</th><th>Creator</th><th>Deliverables</th><th>Stage</th><th>Agreed fee</th></tr></thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.name}>
                      <td className="primary-cell">{campaign.name}<span className="sub-cell">Fictional sample campaign</span></td>
                      <td>{campaign.product}</td>
                      <td>{campaign.creator}</td>
                      <td>{campaign.deliverables}</td>
                      <td><span className="badge sample">{campaign.stage}</span></td>
                      <td>{campaign.fee}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface guest-demo-section" id="guest-creators" data-testid="demo-creator-profiles">
            <div className="section-head">
              <div>
                <h2 className="section-title">Creator Profiles</h2>
                <div className="section-sub">Profile figures are fictional and are not verified platform data.</div>
              </div>
              <span className="badge sample">Fictional profiles</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Creator</th><th>Platform</th><th>Category</th><th>Followers</th><th>Engagement</th><th>Source</th></tr></thead>
                <tbody>
                  {creators.map((creator) => (
                    <tr key={creator.name}>
                      <td className="primary-cell">{creator.name}</td>
                      <td>{creator.platform}</td>
                      <td>{creator.category}</td>
                      <td>{creator.followers}</td>
                      <td>{creator.engagement}</td>
                      <td><span className="badge sample">{creator.source}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface guest-demo-section" id="guest-matching" data-testid="demo-brand-creator-matching">
            <div className="section-head">
              <div>
                <h2 className="section-title">Brand-Creator Matching</h2>
                <div className="section-sub">Illustrative fit based on sample product interests and audience locations.</div>
              </div>
              <span className="badge sample">Illustrative only</span>
            </div>
            <div className="grid-three">
              {matches.map((match) => (
                <article className="stat-card" key={`${match.product}-${match.creator}`}>
                  <div className="section-head">
                    <div>
                      <div className="stat-label">{match.product}</div>
                      <div className="row-name" style={{marginTop:9}}>{match.creator}</div>
                    </div>
                    <span className="badge sample">{match.fit} sample fit</span>
                  </div>
                  <div className="row-meta">{match.reasons}</div>
                </article>
              ))}
            </div>
            <p className="section-sub" style={{marginTop:14}}>These sample fit scores demonstrate the matching view; they are not predictions or verified recommendations.</p>
          </section>

          <section className="surface guest-demo-section" id="guest-analytics" data-testid="demo-campaign-analytics">
            <div className="section-head">
              <div>
                <h2 className="section-title">Campaign Analytics</h2>
                <div className="section-sub">Example attention signals and sample attributed orders are shown separately.</div>
              </div>
              <span className="badge sample">Fictional metrics</span>
            </div>
            <div className="grid-two">
              <div className="bar-list">
                {analytics.map((metric) => (
                  <div className="bar-row" key={metric.label}>
                    <span>{metric.label}</span>
                    <div className="bar-track"><div className="bar-fill" style={{width:metric.fill}}/></div>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
              <div className="notice">
                <strong>Sample only.</strong> Reach, views, and clicks are attention signals—not sales. The 12 attributed orders are also fictional sample records. No external platform data is being reported.
              </div>
            </div>
            <div className="grid-three" style={{marginTop:18}}>
              <div className="stat-card"><div className="stat-label">Tote launch — demo</div><div className="stat-value">12</div><div className="stat-foot">Sample attributed orders</div></div>
              <div className="stat-card"><div className="stat-label">Cup review — demo</div><div className="stat-value">8</div><div className="stat-foot">Sample attributed orders</div></div>
              <div className="stat-card"><div className="stat-label">Source status</div><div style={{marginTop:12}}><span className="badge sample">Fictional demo records</span></div><div className="stat-foot">Not connected to live accounts</div></div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Router() {
  return <Switch>
    <Route path="/demo" component={GuestDashboard}/>
    <Route path="/" component={AuthGate}/><Route path="/products" component={AuthGate}/><Route path="/promoters/discover" component={AuthGate}/><Route path="/promoters/compare" component={AuthGate}/><Route path="/promoter-reviews" component={AuthGate}/><Route path="/campaigns" component={AuthGate}/><Route path="/videos" component={AuthGate}/><Route path="/promotion-analytics" component={AuthGate}/><Route path="/links" component={AuthGate}/><Route path="/orders" component={AuthGate}/><Route path="/locations" component={AuthGate}/><Route path="/reviews" component={AuthGate}/><Route path="/demand" component={AuthGate}/><Route path="/financials" component={AuthGate}/><Route path="/insights" component={AuthGate}/><Route path="/reports" component={AuthGate}/><Route path="/settings" component={AuthGate}/><Route><AuthGate/></Route>
  </Switch>;
}
function App() { return <QueryClientProvider client={qc}><Router/></QueryClientProvider>; }
export default App;
