(function () {
'use strict';
function calT(key, fallback) {
    return (typeof window.altivorGetTranslation === 'function') ? window.altivorGetTranslation(key, fallback) : fallback;
}

/* === COUNTRY CONFIG === */
var FLAGS = {
    us:'https://flagcdn.com/w40/us.png', gb:'https://flagcdn.com/w40/gb.png',
    de:'https://flagcdn.com/w40/de.png', eu:'https://flagcdn.com/w40/eu.png',
    fr:'https://flagcdn.com/w40/fr.png', jp:'https://flagcdn.com/w40/jp.png',
    ch:'https://flagcdn.com/w40/ch.png', es:'https://flagcdn.com/w40/es.png',
    it:'https://flagcdn.com/w40/it.png', cn:'https://flagcdn.com/w40/cn.png',
    au:'https://flagcdn.com/w40/au.png', ca:'https://flagcdn.com/w40/ca.png',
    nz:'https://flagcdn.com/w40/nz.png'
};
var COUNTRY_NAMES = {
    us:'United States',gb:'United Kingdom',de:'Germany',eu:'Eurozone',fr:'France',
    jp:'Japan',ch:'Switzerland',es:'Spain',it:'Italy',cn:'China',au:'Australia',
    ca:'Canada',nz:'New Zealand'
};

/* === EVENT CATEGORIES === */
function categorize(ev) {
    var n = ev.event.toLowerCase();
    if (n.includes('interest rate') || n.includes('rate decision') || n.includes('press conference') || n.includes('monetary policy') || n.includes('fomc') || n.includes('boe') || n.includes('boj') || n.includes('snb') || n.includes('rba') || n.includes('fed chair') || n.includes('ecb ') || n.includes('fed ') || n.includes('general council')) return 'central_bank';
    if (n.includes('payroll') || n.includes('employment') || n.includes('jobless') || n.includes('unemployment') || n.includes('jolts') || n.includes('adp non-farm') || n.includes('nonfarm') || n.includes('jobs') || n.includes('challenger')) return 'employment';
    if (n.includes('cpi') || n.includes('ppi') || n.includes('inflation') || n.includes('prices paid') || n.includes('price index') || n.includes('pce') || n.includes('deflator')) return 'inflation';
    if (n.includes('pmi') || n.includes('gdp') || n.includes('ism ') || n.includes('industrial production') || n.includes('factory order') || n.includes('manufacturing') || n.includes('services')) return 'pmi_gdp';
    if (n.includes('consumer') || n.includes('retail') || n.includes('sentiment') || n.includes('confidence') || n.includes('spending') || n.includes('michigan')) return 'consumer';
    return 'other';
}

/* === 3 WEEKS OF DATA === */
var WEEKS = [
{ label:'March 24 \u2013 28, 2026', days:[
    { day:'Monday', date:'March 24, 2026', events:[
        {time:'09:15',country:'fr',event:'S&P Global Manufacturing PMI (Flash)',impact:'high',prev:'49.5',forecast:'49.5',actual:'50.2',desc:'Flash PMI for French manufacturing. Above 50 signals expansion; surprise beat.'},
        {time:'09:15',country:'fr',event:'S&P Global Services PMI (Flash)',impact:'high',prev:'49.0',forecast:'49.9',actual:'48.3',desc:'French services sector flash reading. Below expectations indicates slowing activity.'},
        {time:'09:30',country:'de',event:'S&P Global Manufacturing PMI (Flash)',impact:'high',prev:'49.5',forecast:'49.9',actual:'51.7',desc:'Germany\u2019s manufacturing flash PMI. Surprised to the upside above 50 expansion threshold.'},
        {time:'09:30',country:'de',event:'S&P Global Services PMI (Flash)',impact:'high',prev:'52.5',forecast:'52.5',actual:'51.2',desc:'German services activity. Slight miss vs consensus.'},
        {time:'10:00',country:'eu',event:'Eurozone Manufacturing PMI (Flash)',impact:'high',prev:'49.4',forecast:'49.8',actual:'51.4',desc:'Aggregate eurozone manufacturing PMI. Moved above 50 into expansion territory.'},
        {time:'10:00',country:'eu',event:'Eurozone Services PMI (Flash)',impact:'high',prev:'51.1',forecast:'50.5',actual:'50.1',desc:'Eurozone services sector flash reading. Marginal miss but still above 50.'},
        {time:'10:30',country:'gb',event:'UK Manufacturing PMI (Flash)',impact:'high',prev:'50.1',forecast:'51.1',actual:'51.4',desc:'UK manufacturing flash PMI. Beat expectations, continuing expansion.'},
        {time:'10:30',country:'gb',event:'UK Services PMI (Flash)',impact:'high',prev:'53.0',forecast:'52.8',actual:'51.2',desc:'UK services sector flash reading. Below forecast, suggesting deceleration.'},
        {time:'14:45',country:'us',event:'S&P Global Manufacturing PMI (Flash)',impact:'high',prev:'51.3',forecast:'50.2',actual:'52.4',desc:'US manufacturing flash PMI. Strong beat vs consensus, indicating resilient factory activity.'},
        {time:'14:45',country:'us',event:'S&P Global Services PMI (Flash)',impact:'high',prev:'51.5',forecast:'50.4',actual:'51.1',desc:'US services flash PMI. Above forecast, supporting growth narrative.'},
        {time:'15:00',country:'us',event:'Richmond Fed Manufacturing Index',impact:'medium',prev:'-5',forecast:'-11',actual:'0',desc:'Regional manufacturing survey from the Richmond Fed. Strong beat signals stabilization.'}
    ]},
    { day:'Tuesday', date:'March 25, 2026', events:[
        {time:'10:00',country:'de',event:'Ifo Business Climate',impact:'high',prev:'85.9',forecast:'86.4',actual:'86.1',desc:'Germany\u2019s most closely watched business survey. Composite of current conditions and expectations.'},
        {time:'10:00',country:'de',event:'Ifo Current Conditions',impact:'medium',prev:'86.2',forecast:'86.2',actual:'86',desc:'German business assessment of current economic conditions.'},
        {time:'10:00',country:'de',event:'Ifo Expectations',impact:'medium',prev:'85.9',forecast:'85.9',actual:'86',desc:'German business expectations for the next 6 months. Forward-looking component.'},
        {time:'10:00',country:'eu',event:'ECB Cipollone Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'ECB Executive Board member Cipollone delivers remarks on monetary policy.'},
        {time:'10:30',country:'gb',event:'BoE Pill Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'BoE Chief Economist Huw Pill speaks. Key voice on UK monetary policy trajectory.'},
        {time:'13:30',country:'us',event:'Nonfarm Productivity (QoQ) \u2014 Final',impact:'medium',prev:'2.8%',forecast:'2.0%',actual:'1.8%',desc:'Output per hour in the non-farm sector. Final revision. Weaker than expected.'},
        {time:'13:30',country:'us',event:'Unit Labour Costs (QoQ) \u2014 Final',impact:'medium',prev:'2.8%',forecast:'3.5%',actual:'4.4%',desc:'Final unit labor cost growth. Significantly above forecast \u2014 inflationary signal for the Fed.'},
        {time:'14:00',country:'us',event:'Redbook Index (YoY)',impact:'low',prev:'6.7%',forecast:'\u2014',actual:'6.7%',desc:'Weekly measure of year-over-year US retail sales growth at large general merchandise stores.'},
        {time:'15:00',country:'us',event:'2-Year Note Auction',impact:'medium',prev:'3.936%',forecast:'\u2014',actual:'\u2014',desc:'US Treasury 2-year note auction. Yield indicates short-end rate expectations.'},
        {time:'15:30',country:'us',event:'API Crude Oil Stock Change',impact:'medium',prev:'-1.3M',forecast:'\u2014',actual:'\u2014',desc:'American Petroleum Institute weekly crude oil inventory estimate. Impacts energy market sentiment.'}
    ]},
    { day:'Wednesday', date:'March 26, 2026', events:[
        {time:'01:30',country:'au',event:'CPI (MoM)',impact:'high',prev:'0.1%',forecast:'0.1%',actual:'\u2014',desc:'Australian monthly Consumer Price Index change.'},
        {time:'01:30',country:'au',event:'CPI (YoY)',impact:'high',prev:'3.8%',forecast:'3.8%',actual:'\u2014',desc:'Australian annual inflation rate. Key for RBA policy outlook.'},
        {time:'01:30',country:'au',event:'RBA Trimmed Mean CPI (MoM)',impact:'high',prev:'0.3%',forecast:'0.3%',actual:'\u2014',desc:'RBA\u2019s preferred core inflation measure, trimmed mean quarter-on-quarter.'},
        {time:'01:30',country:'au',event:'RBA Trimmed Mean CPI (YoY)',impact:'high',prev:'3.4%',forecast:'3.4%',actual:'\u2014',desc:'Annual trimmed mean inflation. Key for RBA rate decision outlook.'},
        {time:'08:00',country:'gb',event:'CPI (YoY)',impact:'high',prev:'3.0%',forecast:'3.0%',actual:'\u2014',desc:'UK consumer price inflation. Critical for BoE rate trajectory.'},
        {time:'08:00',country:'gb',event:'Core CPI (YoY)',impact:'high',prev:'3.1%',forecast:'3.1%',actual:'\u2014',desc:'UK core inflation excluding food and energy.'},
        {time:'08:00',country:'gb',event:'CPI (MoM)',impact:'medium',prev:'0.6%',forecast:'0.4%',actual:'\u2014',desc:'UK monthly consumer price change.'},
        {time:'08:00',country:'gb',event:'Core CPI (MoM)',impact:'medium',prev:'0.4%',forecast:'0.5%',actual:'\u2014',desc:'UK monthly core consumer price change excluding food and energy.'},
        {time:'08:00',country:'gb',event:'PPI Input (MoM)',impact:'low',prev:'0.5%',forecast:'0.5%',actual:'\u2014',desc:'UK factory gate input price inflation month-over-month.'},
        {time:'08:00',country:'gb',event:'PPI Output (YoY)',impact:'low',prev:'3.1%',forecast:'\u2014',actual:'\u2014',desc:'UK producer price output year-over-year. Wholesale price pressure indicator.'},
        {time:'09:00',country:'es',event:'PPI (YoY)',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Spain producer price inflation. Wholesale cost pressure indicator.'},
        {time:'10:00',country:'eu',event:'ECB President Lagarde Speech',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'ECB President delivers remarks. Markets scrutinize for monetary policy forward guidance.'},
        {time:'13:30',country:'us',event:'Current Account',impact:'medium',prev:'$-235.0B',forecast:'$-211.0B',actual:'\u2014',desc:'US current account balance. Measures trade, income, and transfer flows.'},
        {time:'13:30',country:'us',event:'Export Prices (MoM)',impact:'low',prev:'0.5%',forecast:'0.5%',actual:'\u2014',desc:'Monthly change in US export prices.'},
        {time:'13:30',country:'us',event:'Import Prices (MoM)',impact:'medium',prev:'0.1%',forecast:'0.5%',actual:'\u2014',desc:'Monthly change in US import prices. Proxy for imported inflation.'},
        {time:'16:30',country:'us',event:'EIA Crude Oil Stocks Change',impact:'medium',prev:'0.5M',forecast:'\u2014',actual:'\u2014',desc:'Official weekly US crude oil inventory data. Direct impact on energy prices.'},
        {time:'18:00',country:'us',event:'5-Year Note Auction',impact:'medium',prev:'2.72%',forecast:'\u2014',actual:'\u2014',desc:'US Treasury 5-year note auction. Indicates medium-term rate expectations.'}
    ]},
    { day:'Thursday', date:'March 27, 2026', events:[
        {time:'08:00',country:'de',event:'GfK Consumer Confidence',impact:'medium',prev:'-27.0',forecast:'-26.5',actual:'\u2014',desc:'German consumer confidence. Persistently negative readings reflect weak household sentiment.'},
        {time:'09:00',country:'fr',event:'Business Confidence',impact:'medium',prev:'98',forecast:'100',actual:'\u2014',desc:'French business confidence indicator. 100 = long-term average.'},
        {time:'09:00',country:'fr',event:'Consumer Confidence',impact:'medium',prev:'87',forecast:'89',actual:'\u2014',desc:'French consumer confidence survey.'},
        {time:'09:00',country:'fr',event:'Business Climate Indicator',impact:'low',prev:'\u2014',forecast:'94',actual:'\u2014',desc:'French manufacturing business climate composite. Measures current conditions.'},
        {time:'10:00',country:'eu',event:'ECB General Council Meeting',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'ECB General Council convenes. Policy discussions and strategic review.'},
        {time:'10:00',country:'eu',event:'ECB Guindos Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'ECB Vice-President Guindos delivers remarks on eurozone monetary policy.'},
        {time:'10:00',country:'es',event:'GDP Growth Rate (QoQ) \u2014 Final',impact:'medium',prev:'0.8%',forecast:'0.8%',actual:'\u2014',desc:'Spain quarterly GDP growth final reading. Confirms economic momentum.'},
        {time:'10:00',country:'es',event:'GDP Growth Rate (YoY) \u2014 Final',impact:'medium',prev:'2.6%',forecast:'2.6%',actual:'\u2014',desc:'Spain annual GDP growth final. Confirms year-over-year expansion.'},
        {time:'10:00',country:'it',event:'Business Confidence',impact:'low',prev:'\u2014',forecast:'86',actual:'\u2014',desc:'Italian business confidence indicator.'},
        {time:'10:00',country:'it',event:'Consumer Confidence',impact:'low',prev:'\u2014',forecast:'95',actual:'\u2014',desc:'Italian consumer confidence survey.'},
        {time:'11:00',country:'eu',event:'Loans to Companies (YoY)',impact:'low',prev:'2.8%',forecast:'\u2014',actual:'\u2014',desc:'Eurozone bank lending to non-financial corporations year-over-year.'},
        {time:'11:00',country:'eu',event:'Loans to Households (YoY)',impact:'low',prev:'3.0%',forecast:'3.1%',actual:'\u2014',desc:'Eurozone bank lending to households. Consumer credit demand indicator.'},
        {time:'11:00',country:'eu',event:'M3 Money Supply (YoY)',impact:'low',prev:'3.4%',forecast:'3.3%',actual:'\u2014',desc:'Eurozone broad money supply growth. Indicator for monetary conditions.'},
        {time:'13:30',country:'us',event:'Initial Jobless Claims',impact:'medium',prev:'209K',forecast:'210K',actual:'\u2014',desc:'Weekly new unemployment insurance claims. Leading labor market indicator.'},
        {time:'13:30',country:'us',event:'Continuing Jobless Claims',impact:'medium',prev:'1860K',forecast:'1860K',actual:'\u2014',desc:'Total number of people receiving unemployment benefits. Measures labor slack.'},
        {time:'15:00',country:'us',event:'Kansas Fed Manufacturing Index',impact:'low',prev:'3',forecast:'\u2014',actual:'\u2014',desc:'Regional manufacturing activity survey from the Kansas City Fed.'},
        {time:'18:00',country:'us',event:'7-Year Note Auction',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'US Treasury 7-year note auction. Reflects intermediate-term rate expectations.'},
        {time:'20:00',country:'us',event:'Fed Cook Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Federal Reserve Governor Cook delivers remarks on economic outlook.'}
    ]},
    { day:'Friday', date:'March 28, 2026', events:[
        {time:'00:01',country:'gb',event:'GfK Consumer Confidence',impact:'medium',prev:'-26',forecast:'-24',actual:'\u2014',desc:'UK consumer confidence indicator. Negative readings indicate pessimism.'},
        {time:'00:30',country:'jp',event:'Tokyo CPI (YoY)',impact:'high',prev:'\u2014',forecast:'1.7%',actual:'\u2014',desc:'Tokyo consumer price inflation. Leading indicator for national CPI and BoJ policy.'},
        {time:'00:30',country:'jp',event:'Tokyo Core CPI (YoY)',impact:'high',prev:'\u2014',forecast:'2.0%',actual:'\u2014',desc:'Tokyo core CPI excluding fresh food. Key for BoJ policy expectations.'},
        {time:'00:30',country:'jp',event:'Tokyo CPI Ex Food & Energy (YoY)',impact:'medium',prev:'\u2014',forecast:'2.2%',actual:'\u2014',desc:'Tokyo CPI excluding food and energy. Underlying inflation pressure gauge.'},
        {time:'00:50',country:'jp',event:'Industrial Production (MoM) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'-2.0%',actual:'\u2014',desc:'Japan preliminary monthly industrial output change.'},
        {time:'08:00',country:'gb',event:'Retail Sales (MoM)',impact:'high',prev:'-0.3%',forecast:'-0.8%',actual:'\u2014',desc:'UK monthly retail sales volume change. Direct consumer spending indicator.'},
        {time:'08:00',country:'gb',event:'Retail Sales (YoY)',impact:'medium',prev:'1.8%',forecast:'2.1%',actual:'\u2014',desc:'UK year-over-year retail sales growth.'},
        {time:'08:00',country:'gb',event:'Retail Sales Ex Fuel (MoM)',impact:'medium',prev:'\u2014',forecast:'0.2%',actual:'\u2014',desc:'UK retail sales excluding automotive fuel month-over-month.'},
        {time:'09:00',country:'es',event:'CPI (YoY) \u2014 Prel',impact:'medium',prev:'2.4%',forecast:'2.4%',actual:'\u2014',desc:'Spain preliminary annual inflation rate.'},
        {time:'09:00',country:'es',event:'Core CPI (YoY) \u2014 Prel',impact:'medium',prev:'2.6%',forecast:'2.6%',actual:'\u2014',desc:'Spain core inflation rate excluding food and energy. Underlying price pressure gauge.'},
        {time:'09:00',country:'es',event:'Harmonised CPI (MoM) \u2014 Prel',impact:'low',prev:'\u2014',forecast:'0.8%',actual:'\u2014',desc:'Spain harmonised monthly inflation. Comparable across the eurozone.'},
        {time:'09:00',country:'es',event:'Harmonised CPI (YoY) \u2014 Prel',impact:'medium',prev:'2.6%',forecast:'2.6%',actual:'\u2014',desc:'Spain harmonised inflation rate used for ECB policy comparison.'},
        {time:'14:00',country:'us',event:'Michigan Consumer Sentiment (Final)',impact:'high',prev:'53.5',forecast:'53.8',actual:'\u2014',desc:'Final University of Michigan consumer confidence. Includes inflation expectations.'},
        {time:'14:00',country:'us',event:'Michigan 5Y Inflation Expectations (Final)',impact:'high',prev:'3.2%',forecast:'3.2%',actual:'\u2014',desc:'5-year consumer inflation expectations. Key for Fed long-term inflation anchoring.'},
        {time:'14:00',country:'us',event:'Michigan Consumer Expectations (Final)',impact:'medium',prev:'54.1',forecast:'54.1',actual:'\u2014',desc:'Consumer expectations component of the Michigan survey.'},
        {time:'14:00',country:'us',event:'Michigan Inflation Expectations (Final)',impact:'medium',prev:'3.4%',forecast:'3.4%',actual:'\u2014',desc:'1-year consumer inflation expectations. Short-term pricing outlook from households.'},
        {time:'18:00',country:'us',event:'Fed Daly Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'San Francisco Fed President Daly speaks. Watch for rate path commentary.'},
        {time:'18:30',country:'eu',event:'ECB Schnabel Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'ECB Executive Board member Schnabel delivers remarks on monetary policy.'},
        {time:'19:00',country:'us',event:'Baker Hughes Oil Rig Count',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Weekly count of active US oil rigs. Indicator of future oil production capacity.'}
    ]}
]},
{ label:'March 30 \u2013 April 3, 2026', days:[
    { day:'Monday', date:'March 30, 2026', events:[
        {time:'01:00',country:'jp',event:'BoJ Summary of Opinions',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Summary from the latest BoJ policy meeting. Details rate decision reasoning and dissent.'},
        {time:'01:30',country:'jp',event:'Housing Starts (YoY)',impact:'low',prev:'\u2014',forecast:'1.0%',actual:'\u2014',desc:'Japanese annual housing starts. Residential construction activity gauge.'},
        {time:'08:00',country:'gb',event:'BoE Consumer Credit',impact:'low',prev:'\u00a31.3B',forecast:'\u00a31.3B',actual:'\u2014',desc:'UK consumer credit change. Measures net lending to individuals.'},
        {time:'08:00',country:'gb',event:'Mortgage Approvals',impact:'medium',prev:'59.5K',forecast:'59.5K',actual:'\u2014',desc:'Number of new mortgage approvals in the UK. Housing market indicator.'},
        {time:'08:00',country:'gb',event:'Mortgage Lending',impact:'low',prev:'\u00a34.4B',forecast:'\u2014',actual:'\u2014',desc:'UK net mortgage lending volume. Housing credit demand indicator.'},
        {time:'08:00',country:'gb',event:'M4 Money Supply (MoM)',impact:'low',prev:'0.2%',forecast:'\u2014',actual:'\u2014',desc:'UK broad money supply growth.'},
        {time:'09:00',country:'es',event:'Retail Sales (MoM)',impact:'low',prev:'0.3%',forecast:'\u2014',actual:'\u2014',desc:'Spain monthly retail sales change. Consumer spending indicator.'},
        {time:'09:00',country:'es',event:'Retail Sales (YoY)',impact:'low',prev:'3.8%',forecast:'\u2014',actual:'\u2014',desc:'Spain annual retail sales growth.'},
        {time:'10:00',country:'it',event:'PPI (MoM)',impact:'low',prev:'0.5%',forecast:'\u2014',actual:'\u2014',desc:'Italy producer price index monthly change. Wholesale cost pressure gauge.'},
        {time:'10:00',country:'it',event:'PPI (YoY)',impact:'low',prev:'-1.8%',forecast:'\u2014',actual:'\u2014',desc:'Italy producer price year-over-year change. Deflation signals persist.'},
        {time:'10:00',country:'de',event:'CPI (YoY) \u2014 Prel',impact:'high',prev:'2.3%',forecast:'2.3%',actual:'\u2014',desc:'German preliminary annual inflation rate. Key input for ECB policy decisions.'},
        {time:'10:00',country:'de',event:'CPI (MoM) \u2014 Prel',impact:'high',prev:'0.7%',forecast:'0.7%',actual:'\u2014',desc:'German preliminary monthly CPI change.'},
        {time:'10:00',country:'de',event:'Harmonised CPI (YoY) \u2014 Prel',impact:'medium',prev:'2.3%',forecast:'2.3%',actual:'\u2014',desc:'German harmonised inflation rate for ECB comparison.'},
        {time:'10:00',country:'de',event:'Harmonised CPI (MoM) \u2014 Prel',impact:'medium',prev:'0.7%',forecast:'0.7%',actual:'\u2014',desc:'German harmonised monthly inflation. ECB-comparable measure.'},
        {time:'11:00',country:'eu',event:'Economic Sentiment Indicator',impact:'medium',prev:'96',forecast:'\u2014',actual:'\u2014',desc:'Eurozone composite economic sentiment from the European Commission.'},
        {time:'11:00',country:'eu',event:'Consumer Confidence (Final)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Final eurozone consumer confidence reading.'},
        {time:'11:00',country:'eu',event:'Consumer Inflation Expectations',impact:'medium',prev:'29',forecast:'\u2014',actual:'\u2014',desc:'Eurozone consumer expectations for future inflation. Forward-looking sentiment gauge.'},
        {time:'11:00',country:'eu',event:'Industrial Sentiment',impact:'low',prev:'-9',forecast:'\u2014',actual:'\u2014',desc:'Eurozone industrial sector confidence index.'},
        {time:'11:00',country:'eu',event:'Services Sentiment',impact:'low',prev:'4',forecast:'\u2014',actual:'\u2014',desc:'Eurozone services sector confidence indicator.'},
        {time:'11:00',country:'es',event:'Business Confidence',impact:'low',prev:'-2.8',forecast:'\u2014',actual:'\u2014',desc:'Spain business confidence indicator. Negative = pessimistic outlook.'},
        {time:'15:30',country:'us',event:'Dallas Fed Manufacturing Index',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Regional manufacturing survey from the Dallas Fed.'},
        {time:'18:00',country:'us',event:'Fed Williams Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'NY Fed President Williams delivers remarks. Key voice on monetary policy.'}
    ]},
    { day:'Tuesday', date:'March 31, 2026', events:[
        {time:'00:30',country:'jp',event:'Unemployment Rate',impact:'medium',prev:'\u2014',forecast:'2.7%',actual:'\u2014',desc:'Japan unemployment rate. Historically low by global standards.'},
        {time:'00:30',country:'jp',event:'Industrial Production (MoM) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'-2.0%',actual:'\u2014',desc:'Japan preliminary industrial output. Manufacturing health gauge.'},
        {time:'00:30',country:'jp',event:'Industrial Production (YoY) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'1.0%',actual:'\u2014',desc:'Japan annual industrial production growth.'},
        {time:'00:30',country:'jp',event:'Retail Sales (YoY)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Japanese annual retail sales growth. Consumer spending indicator.'},
        {time:'02:00',country:'au',event:'RBA Meeting Minutes',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Minutes from the latest RBA monetary policy meeting. Details rate decision rationale and economic outlook.'},
        {time:'02:00',country:'au',event:'Private Sector Credit (MoM)',impact:'low',prev:'0.6%',forecast:'0.6%',actual:'\u2014',desc:'Australian private sector credit growth month-over-month.'},
        {time:'02:00',country:'au',event:'Housing Credit (MoM)',impact:'low',prev:'0.6%',forecast:'\u2014',actual:'\u2014',desc:'Australian housing credit growth. Mortgage demand indicator.'},
        {time:'02:30',country:'cn',event:'NBS Manufacturing PMI',impact:'high',prev:'50.2',forecast:'49.8',actual:'\u2014',desc:'Official Chinese manufacturing PMI. Above 50 = expansion. Major global demand indicator.'},
        {time:'02:30',country:'cn',event:'NBS Non-Manufacturing PMI',impact:'medium',prev:'50.4',forecast:'50.2',actual:'\u2014',desc:'Chinese services and construction sector activity composite.'},
        {time:'02:30',country:'cn',event:'NBS General PMI',impact:'medium',prev:'50.2',forecast:'\u2014',actual:'\u2014',desc:'Chinese composite official PMI. Covers manufacturing and non-manufacturing sectors.'},
        {time:'08:00',country:'de',event:'Retail Sales (MoM)',impact:'medium',prev:'0.5%',forecast:'\u2014',actual:'\u2014',desc:'German monthly retail sales change. Consumer spending indicator.'},
        {time:'08:00',country:'de',event:'Import Prices (MoM)',impact:'low',prev:'0.5%',forecast:'\u2014',actual:'\u2014',desc:'German import price changes month-over-month.'},
        {time:'08:00',country:'gb',event:'Nationwide Housing Prices (MoM)',impact:'medium',prev:'\u2014',forecast:'0.6%',actual:'\u2014',desc:'UK house price changes from Nationwide Building Society.'},
        {time:'08:00',country:'gb',event:'Nationwide Housing Prices (YoY)',impact:'medium',prev:'\u2014',forecast:'1.5%',actual:'\u2014',desc:'UK annual house price growth.'},
        {time:'08:00',country:'gb',event:'GDP Growth Rate (QoQ) \u2014 Final',impact:'high',prev:'0.1%',forecast:'0.1%',actual:'\u2014',desc:'UK final quarterly GDP growth. Confirms economic expansion pace.'},
        {time:'08:00',country:'gb',event:'GDP Growth Rate (YoY) \u2014 Final',impact:'medium',prev:'1.0%',forecast:'1.0%',actual:'\u2014',desc:'UK final annual GDP growth rate.'},
        {time:'08:00',country:'gb',event:'Current Account',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'UK current account balance. Trade and income flow measure.'},
        {time:'08:45',country:'fr',event:'CPI (YoY) \u2014 Prel',impact:'high',prev:'\u2014',forecast:'1.3%',actual:'\u2014',desc:'French preliminary annual inflation rate.'},
        {time:'08:45',country:'fr',event:'CPI (MoM) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'0.6%',actual:'\u2014',desc:'French preliminary monthly CPI change.'},
        {time:'08:45',country:'fr',event:'Harmonised CPI (YoY) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'1.5%',actual:'\u2014',desc:'French harmonised annual inflation for ECB policy comparison.'},
        {time:'08:45',country:'fr',event:'Household Consumption (MoM)',impact:'medium',prev:'0.2%',forecast:'\u2014',actual:'\u2014',desc:'French monthly household consumption expenditure.'},
        {time:'09:55',country:'de',event:'Unemployment Change',impact:'high',prev:'\u2014',forecast:'5K',actual:'\u2014',desc:'German monthly change in unemployed persons. Leading labor market indicator.'},
        {time:'09:55',country:'de',event:'Unemployment Rate',impact:'medium',prev:'\u2014',forecast:'6.3%',actual:'\u2014',desc:'German unemployment rate. Structural labor market health measure.'},
        {time:'10:00',country:'es',event:'Current Account',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Spain current account balance. External trade and income flows.'},
        {time:'11:00',country:'eu',event:'CPI (YoY) \u2014 Flash',impact:'high',prev:'\u2014',forecast:'2.2%',actual:'\u2014',desc:'Eurozone flash annual inflation rate. Key for ECB rate path decisions.'},
        {time:'11:00',country:'eu',event:'Core CPI (YoY) \u2014 Flash',impact:'high',prev:'\u2014',forecast:'2.3%',actual:'\u2014',desc:'Eurozone flash core inflation. ECB\u2019s preferred underlying price pressure gauge.'},
        {time:'11:00',country:'eu',event:'CPI (MoM) \u2014 Flash',impact:'medium',prev:'\u2014',forecast:'0.9%',actual:'\u2014',desc:'Eurozone monthly flash inflation. Short-term price momentum indicator.'},
        {time:'11:00',country:'it',event:'CPI (YoY) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'1.9%',actual:'\u2014',desc:'Italy preliminary annual inflation rate.'},
        {time:'11:00',country:'it',event:'CPI (MoM) \u2014 Prel',impact:'low',prev:'\u2014',forecast:'0.7%',actual:'\u2014',desc:'Italy preliminary monthly CPI change.'},
        {time:'11:00',country:'it',event:'Harmonised CPI (YoY) \u2014 Prel',impact:'medium',prev:'\u2014',forecast:'1.8%',actual:'\u2014',desc:'Italy harmonised inflation for ECB policy comparison.'},
        {time:'14:00',country:'us',event:'S&P/Case-Shiller Home Price Index (YoY)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'20-city composite home price index. Key US housing market indicator.'},
        {time:'14:45',country:'us',event:'Chicago PMI',impact:'medium',prev:'\u2014',forecast:'54',actual:'\u2014',desc:'Chicago purchasing managers index. Regional manufacturing and services composite.'},
        {time:'15:00',country:'us',event:'CB Consumer Confidence',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Conference Board consumer confidence. Broader and more timely than Michigan survey.'},
        {time:'15:00',country:'us',event:'JOLTS Job Openings',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Job Openings and Labor Turnover Survey. Fed watches this for labor market tightness signals.'},
        {time:'15:00',country:'us',event:'Dallas Fed Services Index',impact:'low',prev:'-1',forecast:'\u2014',actual:'\u2014',desc:'Regional services sector activity from the Dallas Fed.'},
        {time:'18:00',country:'us',event:'Fed Goolsbee Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Chicago Fed President Goolsbee speaks. Watch for rate path and inflation commentary.'}
    ]},
    { day:'Wednesday', date:'April 1, 2026', events:[
        {time:'00:50',country:'jp',event:'Tankan Large Manufacturers Index',impact:'high',prev:'\u2014',forecast:'14',actual:'\u2014',desc:'Bank of Japan quarterly business confidence survey for large manufacturers. Key gauge of corporate sentiment.'},
        {time:'00:50',country:'jp',event:'Tankan Large Non-Manufacturing Index',impact:'high',prev:'\u2014',forecast:'39',actual:'\u2014',desc:'BoJ survey of large non-manufacturing firms. Services sector confidence gauge.'},
        {time:'00:50',country:'jp',event:'Tankan Large Manufacturing Outlook',impact:'medium',prev:'\u2014',forecast:'14',actual:'\u2014',desc:'Expected business conditions for large manufacturers over the next quarter.'},
        {time:'00:50',country:'jp',event:'Tankan Small Manufacturers Index',impact:'medium',prev:'\u2014',forecast:'1',actual:'\u2014',desc:'BoJ survey of small manufacturing firms. Broader economic sentiment check.'},
        {time:'01:30',country:'au',event:'S&P Global Manufacturing PMI (Final)',impact:'medium',prev:'50.1',forecast:'50.1',actual:'\u2014',desc:'Australia final manufacturing PMI. Confirms or revises flash estimate.'},
        {time:'01:30',country:'au',event:'Building Permits (MoM) \u2014 Prel',impact:'medium',prev:'4.5%',forecast:'\u2014',actual:'\u2014',desc:'Australian monthly building permits change. Leading housing construction indicator.'},
        {time:'01:30',country:'au',event:'Commodity Prices (YoY)',impact:'low',prev:'-1.8%',forecast:'\u2014',actual:'\u2014',desc:'RBA index of Australian commodity export prices.'},
        {time:'02:45',country:'cn',event:'Caixin Manufacturing PMI',impact:'high',prev:'51.2',forecast:'51.7',actual:'\u2014',desc:'Private sector Chinese manufacturing PMI. Focused on small and medium enterprises. Above 50 = expansion.'},
        {time:'09:00',country:'es',event:'HCOB Manufacturing PMI',impact:'medium',prev:'50.4',forecast:'\u2014',actual:'\u2014',desc:'Spain HCOB manufacturing PMI. Sector activity and momentum gauge.'},
        {time:'09:45',country:'it',event:'HCOB Manufacturing PMI',impact:'medium',prev:'51.5',forecast:'\u2014',actual:'\u2014',desc:'Italy HCOB manufacturing PMI. Factory sector health indicator.'},
        {time:'09:50',country:'fr',event:'S&P Global Manufacturing PMI (Final)',impact:'medium',prev:'50.2',forecast:'50.2',actual:'\u2014',desc:'France final manufacturing PMI. Confirms or revises flash estimate.'},
        {time:'09:55',country:'de',event:'German Manufacturing PMI (Final)',impact:'high',prev:'51.7',forecast:'51.7',actual:'\u2014',desc:'Germany final manufacturing PMI. Confirms or revises flash estimate.'},
        {time:'10:00',country:'eu',event:'Eurozone Manufacturing PMI (Final)',impact:'high',prev:'51.4',forecast:'51.4',actual:'\u2014',desc:'Final eurozone manufacturing PMI reading for the month.'},
        {time:'10:00',country:'it',event:'Unemployment Rate',impact:'medium',prev:'5.1%',forecast:'\u2014',actual:'\u2014',desc:'Italian unemployment rate. Labor market slack indicator.'},
        {time:'10:00',country:'eu',event:'Unemployment Rate',impact:'medium',prev:'6.1%',forecast:'6.1%',actual:'\u2014',desc:'Overall unemployment rate for the eurozone bloc.'},
        {time:'10:30',country:'gb',event:'UK Manufacturing PMI (Final)',impact:'medium',prev:'51.4',forecast:'51.4',actual:'\u2014',desc:'UK final manufacturing PMI.'},
        {time:'13:15',country:'us',event:'ADP Non-Farm Employment Change',impact:'high',prev:'80K',forecast:'\u2014',actual:'\u2014',desc:'Private sector employment data. Often viewed as a preview of Friday\u2019s NFP report.'},
        {time:'14:45',country:'us',event:'S&P Global Manufacturing PMI (Final)',impact:'medium',prev:'52.4',forecast:'52.4',actual:'\u2014',desc:'US final manufacturing PMI. Confirms or revises flash estimate.'},
        {time:'15:00',country:'us',event:'ISM Manufacturing PMI',impact:'high',prev:'\u2014',forecast:'49',actual:'\u2014',desc:'Institute for Supply Management manufacturing index. Key US economic barometer. Below 50 = contraction.'},
        {time:'15:00',country:'us',event:'ISM Manufacturing Prices Paid',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Input cost inflation in the US manufacturing sector. Rising values signal inflationary pressure.'},
        {time:'15:00',country:'us',event:'ISM Manufacturing Employment',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Employment sub-index from ISM manufacturing. Labor market signal for the goods sector.'},
        {time:'15:00',country:'us',event:'ISM Manufacturing New Orders',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'New orders sub-index from ISM manufacturing. Leading demand indicator.'},
        {time:'16:30',country:'us',event:'EIA Crude Oil Inventories',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Weekly US crude oil stock changes. Direct impact on energy prices and inflation outlook.'},
        {time:'18:00',country:'us',event:'Fed Musalem Speech',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'St. Louis Fed President Musalem delivers remarks on economic conditions.'}
    ]},
    { day:'Thursday', date:'April 2, 2026', events:[
        {time:'02:30',country:'au',event:'Balance of Trade',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Australian trade balance. Exports minus imports. Key commodity-driven indicator.'},
        {time:'08:00',country:'gb',event:'DMP CPI Expectations (1Y)',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'BoE Decision Maker Panel 1-year CPI expectations. Business inflation outlook.'},
        {time:'10:00',country:'it',event:'Retail Sales (MoM)',impact:'low',prev:'0.4%',forecast:'\u2014',actual:'\u2014',desc:'Italy monthly retail sales. Consumer spending indicator.'},
        {time:'10:00',country:'it',event:'Retail Sales (YoY)',impact:'low',prev:'2.5%',forecast:'\u2014',actual:'\u2014',desc:'Italy annual retail sales growth.'},
        {time:'12:30',country:'us',event:'Challenger Job Cuts',impact:'medium',prev:'90K',forecast:'\u2014',actual:'\u2014',desc:'Announced corporate layoffs. Rising cuts signal labor market deterioration.'},
        {time:'13:30',country:'us',event:'Initial Jobless Claims',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Weekly new unemployment insurance claims. Leading labor market indicator.'},
        {time:'13:30',country:'us',event:'Continuing Jobless Claims',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Total persons receiving unemployment benefits. Labor market slack measure.'},
        {time:'13:30',country:'us',event:'Trade Balance',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'US goods and services trade deficit. Structural component of GDP.'},
        {time:'13:30',country:'us',event:'Exports',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Total US goods and services exports.'},
        {time:'13:30',country:'us',event:'Imports',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Total US goods and services imports.'},
        {time:'15:00',country:'us',event:'Factory Orders (MoM)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'New orders placed with US domestic manufacturers.'},
        {time:'15:30',country:'us',event:'EIA Natural Gas Stocks Change',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Weekly natural gas storage changes. Energy market supply indicator.'}
    ]},
    { day:'Friday', date:'April 3, 2026', events:[
        {time:'00:30',country:'jp',event:'S&P Global Services PMI (Final)',impact:'medium',prev:'52.8',forecast:'52.8',actual:'\u2014',desc:'Japan final services PMI. Confirms or revises flash estimate.'},
        {time:'00:30',country:'jp',event:'S&P Global Composite PMI (Final)',impact:'medium',prev:'52.5',forecast:'52.5',actual:'\u2014',desc:'Japan final composite PMI covering manufacturing and services.'},
        {time:'02:45',country:'cn',event:'Caixin Services PMI',impact:'high',prev:'\u2014',forecast:'54.5',actual:'\u2014',desc:'Private sector Chinese services PMI. Consumer-facing sector activity gauge. Above 50 = expansion.'},
        {time:'08:00',country:'fr',event:'Industrial Production (MoM)',impact:'medium',prev:'0.3%',forecast:'\u2014',actual:'\u2014',desc:'French monthly industrial output change. Manufacturing sector health.'},
        {time:'09:00',country:'es',event:'HCOB Services PMI',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Spain HCOB services PMI. Services sector activity indicator.'},
        {time:'09:45',country:'it',event:'HCOB Services PMI',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Italy HCOB services PMI. Services sector health gauge.'},
        {time:'09:50',country:'fr',event:'S&P Global Services PMI (Final)',impact:'medium',prev:'48.3',forecast:'48.3',actual:'\u2014',desc:'France final services PMI. Confirms or revises flash estimate.'},
        {time:'09:55',country:'de',event:'German Services PMI (Final)',impact:'medium',prev:'51.2',forecast:'51.2',actual:'\u2014',desc:'Germany final services PMI. Confirms or revises flash estimate.'},
        {time:'10:00',country:'eu',event:'Eurozone Services PMI (Final)',impact:'high',prev:'50.1',forecast:'50.1',actual:'\u2014',desc:'Final eurozone services PMI. Services account for ~70% of eurozone GDP.'},
        {time:'10:30',country:'gb',event:'UK Services PMI (Final)',impact:'medium',prev:'51.2',forecast:'51.2',actual:'\u2014',desc:'UK final services PMI reading.'},
        {time:'13:30',country:'us',event:'Non-Farm Payrolls',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'The most closely watched employment indicator. Measures monthly change in US non-farm jobs.'},
        {time:'13:30',country:'us',event:'Unemployment Rate',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Percentage of the US labor force that is unemployed and actively seeking work.'},
        {time:'13:30',country:'us',event:'Average Hourly Earnings (MoM)',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Wage inflation proxy. Rising earnings may pressure the Fed toward tighter policy.'},
        {time:'15:00',country:'us',event:'ISM Services PMI',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'US services sector PMI from ISM. Services dominate the US economy.'},
        {time:'15:00',country:'us',event:'ISM Services Employment',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Employment sub-index from ISM services. Labor demand in the services sector.'},
        {time:'15:00',country:'us',event:'ISM Services New Orders',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'New orders sub-index from ISM services. Forward-looking demand indicator.'}
    ]}
]},
{ label:'April 6 \u2013 10, 2026', days:[
    { day:'Monday', date:'April 6, 2026', events:[
        {time:'10:00',country:'eu',event:'Sentix Investor Confidence',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Monthly survey of investor confidence in the eurozone economic outlook.'},
        {time:'10:00',country:'eu',event:'Eurozone Retail Sales (MoM)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Consumer spending indicator for the eurozone bloc.'},
        {time:'11:00',country:'eu',event:'Eurozone PPI (YoY)',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Year-over-year producer price inflation across the eurozone.'}
    ]},
    { day:'Tuesday', date:'April 7, 2026', events:[
        {time:'07:00',country:'de',event:'German Factory Orders (MoM)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'New orders received by German manufacturers. Volatile but forward-looking indicator.'},
        {time:'10:00',country:'de',event:'German ZEW Economic Sentiment',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Institutional investor expectations for the German economy. Key forward-looking indicator.'},
        {time:'10:00',country:'eu',event:'Eurozone ZEW Economic Sentiment',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Eurozone-wide economic expectations from institutional investors.'},
        {time:'14:00',country:'us',event:'NFIB Small Business Optimism',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Small business sentiment index. Gauge of Main Street economic expectations.'}
    ]},
    { day:'Wednesday', date:'April 8, 2026', events:[
        {time:'08:00',country:'de',event:'German Industrial Production (MoM)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Output change from German mines, quarries, and factories.'},
        {time:'13:30',country:'us',event:'CPI (MoM)',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Consumer Price Index monthly change. The primary US inflation gauge watched by the Fed.'},
        {time:'13:30',country:'us',event:'CPI (YoY)',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Year-over-year consumer price inflation.'},
        {time:'13:30',country:'us',event:'Core CPI (MoM)',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'CPI excluding food and energy. The Fed\u2019s preferred underlying inflation measure.'},
        {time:'13:30',country:'us',event:'Core CPI (YoY)',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Year-over-year core inflation rate. Key for Fed policy trajectory.'},
        {time:'19:00',country:'us',event:'FOMC Meeting Minutes',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Minutes from the most recent FOMC meeting. Reveals policy debate details and voting dynamics.'},
        {time:'16:30',country:'us',event:'EIA Crude Oil Inventories',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Weekly crude oil stock changes.'}
    ]},
    { day:'Thursday', date:'April 9, 2026', events:[
        {time:'08:00',country:'gb',event:'UK GDP (MoM)',impact:'high',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Monthly GDP estimate for the UK economy.'},
        {time:'08:00',country:'gb',event:'UK Industrial Production (MoM)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'UK industrial output change.'},
        {time:'08:00',country:'gb',event:'UK Trade Balance',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'UK goods trade balance.'},
        {time:'13:30',country:'us',event:'PPI (MoM)',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Producer Price Index measures wholesale price changes. Leading indicator for consumer inflation.'},
        {time:'13:30',country:'us',event:'Initial Jobless Claims',impact:'medium',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Weekly new unemployment insurance claims.'}
    ]},
    { day:'Friday', date:'April 10, 2026', events:[
        {time:'13:30',country:'us',event:'Import Price Index (MoM)',impact:'low',prev:'\u2014',forecast:'\u2014',actual:'\u2014',desc:'Measures price changes of imported goods into the US. Proxy for imported inflation.'},
        {time:'15:00',country:'us',event:'Michigan Consumer Sentiment (Prel)',impact:'medium',prev:'53.5',forecast:'\u2014',actual:'\u2014',desc:'Preliminary University of Michigan consumer confidence survey.'},
        {time:'15:00',country:'us',event:'Michigan 5Y Inflation Expectations (Prel)',impact:'high',prev:'3.2%',forecast:'\u2014',actual:'\u2014',desc:'Preliminary 5-year consumer inflation expectations. Critical for Fed inflation-anchoring assessment.'}
    ]}
]}
];

/* === STATE === */
var weekIdx = 0, impactFilter = 'all', countryFilter = 'all', catFilter = 'all', searchTerm = '';

/* === HELPERS === */
function allEvents(w) { return w.days.reduce(function(a, d) { return a.concat(d.events); }, []); }
function filterEvents(events) {
    return events.filter(function(e) {
        if (impactFilter !== 'all' && e.impact !== impactFilter) return false;
        if (countryFilter !== 'all' && e.country !== countryFilter) return false;
        if (catFilter !== 'all' && categorize(e) !== catFilter) return false;
        if (searchTerm && e.event.toLowerCase().indexOf(searchTerm) === -1) return false;
        return true;
    });
}

/* === UPDATE STATS === */
function updateStats() {
    var week = WEEKS[weekIdx];
    var all = allEvents(week);
    document.getElementById('statTotal').textContent = all.length;
    document.getElementById('statHigh').textContent = all.filter(function(e) { return e.impact === 'high'; }).length;
    var countries = {};
    all.forEach(function(e) { countries[e.country] = true; });
    document.getElementById('statCountries').textContent = Object.keys(countries).length;
    document.getElementById('statCentral').textContent = all.filter(function(e) { return categorize(e) === 'central_bank'; }).length;
}

/* === UPDATE TAB COUNTS === */
function updateTabCounts() {
    var all = allEvents(WEEKS[weekIdx]);
    var base = all.filter(function(e) {
        if (impactFilter !== 'all' && e.impact !== impactFilter) return false;
        if (countryFilter !== 'all' && e.country !== countryFilter) return false;
        if (searchTerm && e.event.toLowerCase().indexOf(searchTerm) === -1) return false;
        return true;
    });
    document.getElementById('tabAll').textContent = base.length;
    document.getElementById('tabCB').textContent = base.filter(function(e) { return categorize(e) === 'central_bank'; }).length;
    document.getElementById('tabEmp').textContent = base.filter(function(e) { return categorize(e) === 'employment'; }).length;
    document.getElementById('tabInf').textContent = base.filter(function(e) { return categorize(e) === 'inflation'; }).length;
    document.getElementById('tabPMI').textContent = base.filter(function(e) { return categorize(e) === 'pmi_gdp'; }).length;
    document.getElementById('tabCon').textContent = base.filter(function(e) { return categorize(e) === 'consumer'; }).length;
    document.getElementById('tabOther').textContent = base.filter(function(e) { return categorize(e) === 'other'; }).length;
}

/* === RENDER === */
function render() {
    var week = WEEKS[weekIdx];
    document.getElementById('calWeekLabel').textContent = week.label;
    updateStats();
    updateTabCounts();

    var body = document.getElementById('calendarBody');
    body.innerHTML = '';

    var totalShown = 0;
    week.days.forEach(function(dayData) {
        var filtered = filterEvents(dayData.events);
        if (filtered.length === 0) return;
        totalShown += filtered.length;

        var group = document.createElement('div');
        group.className = 'cal-day-group';
        group.innerHTML = '<div class="cal-day-header"><span class="cal-day-name">' + dayData.day + '</span><span class="cal-day-date">' + dayData.date + '</span><span class="cal-day-count">' + filtered.length + ' event' + (filtered.length !== 1 ? 's' : '') + '</span></div>';

        filtered.forEach(function(ev, idx) {
            var flagUrl = FLAGS[ev.country] || '';
            var cName = COUNTRY_NAMES[ev.country] || ev.country.toUpperCase();
            var uid = dayData.date.replace(/\s/g, '') + '_' + idx;

            var row = document.createElement('div');
            row.className = 'cal-event';
            row.dataset.impact = ev.impact;
            row.innerHTML = '<span class="cal-time">' + ev.time + '</span>' +
                '<img class="cal-flag" src="' + flagUrl + '" alt="' + ev.country.toUpperCase() + '" />' +
                '<div class="cal-event-info"><span class="cal-event-name">' + ev.event + '</span><span class="cal-event-country">' + cName + '</span></div>' +
                '<span class="cal-impact ' + ev.impact + '">' + ev.impact + '</span>' +
                '<span class="cal-val">' + ev.prev + '</span>' +
                '<span class="cal-val">' + ev.forecast + '</span>' +
                '<span class="cal-val">' + ev.actual + '</span>';

            row.addEventListener('click', (function(id) {
                return function() {
                    var det = document.getElementById('detail_' + id);
                    if (det) det.classList.toggle('open');
                };
            })(uid));
            group.appendChild(row);

            if (ev.desc) {
                var detail = document.createElement('div');
                detail.className = 'cal-event-detail';
                detail.id = 'detail_' + uid;
                detail.innerHTML = '<div class="cal-detail-grid">' +
                    '<div class="cal-detail-item"><label>Previous</label><span>' + ev.prev + '</span></div>' +
                    '<div class="cal-detail-item"><label>Forecast</label><span>' + ev.forecast + '</span></div>' +
                    '<div class="cal-detail-item"><label>Actual</label><span>' + ev.actual + '</span></div>' +
                    '</div><div class="cal-detail-desc">' + ev.desc + '</div>';
                group.appendChild(detail);
            }
        });
        body.appendChild(group);
    });

    if (totalShown === 0) {
        body.innerHTML = '<div class="cal-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><p>' + calT('pnl_no_events', 'No events match your current filters.') + '</p></div>';
    }
}

/* === EVENT LISTENERS === */

// Week navigation
document.getElementById('calPrev').addEventListener('click', function() {
    if (weekIdx > 0) { weekIdx--; render(); }
});
document.getElementById('calNext').addEventListener('click', function() {
    if (weekIdx < WEEKS.length - 1) { weekIdx++; render(); }
});

// Impact filter
document.getElementById('impactFilters').addEventListener('click', function(e) {
    var btn = e.target.closest('.cal-filter-btn');
    if (!btn) return;
    impactFilter = btn.dataset.impact;
    this.querySelectorAll('.cal-filter-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
    render();
});

// Country filter
document.getElementById('countryFilters').addEventListener('click', function(e) {
    var btn = e.target.closest('.cal-country-btn');
    if (!btn) return;
    countryFilter = btn.dataset.country;
    this.querySelectorAll('.cal-country-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
    render();
});

// Category tabs
document.getElementById('calTabs').addEventListener('click', function(e) {
    var btn = e.target.closest('.cal-tab');
    if (!btn) return;
    catFilter = btn.dataset.cat;
    this.querySelectorAll('.cal-tab').forEach(function(b) { b.classList.toggle('active', b === btn); });
    render();
});

// Search
var searchTimer;
document.getElementById('calSearch').addEventListener('input', function() {
    clearTimeout(searchTimer);
    var val = this.value.toLowerCase().trim();
    searchTimer = setTimeout(function() { searchTerm = val; render(); }, 200);
});

/* === THEME === */
var themeButtons = document.querySelectorAll('.theme-btn');
var htmlEl = document.documentElement;
var THEME_KEY = 'altivor-theme';
function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    themeButtons.forEach(function(b) { b.classList.toggle('active', b.dataset.theme === theme); });
    localStorage.setItem(THEME_KEY, theme);
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
themeButtons.forEach(function(btn) { btn.addEventListener('click', function() { applyTheme(btn.dataset.theme); }); });

/* === HAMBURGER === */
var hamburger = document.getElementById('hamburger');
if (hamburger) hamburger.addEventListener('click', function() { hamburger.classList.toggle('open'); });

/* === INIT === */
render();
document.addEventListener('altivor:languagechange', function() { render(); });
})();
