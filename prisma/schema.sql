CREATE TABLE "ApiCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "GoogleToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "gscProperty" TEXT,
    "vertical" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
, "brandIntelligence" TEXT, "competitors" TEXT, "contentTopics" TEXT, "coreProducts" TEXT, "notBrand" TEXT, "sitePages" TEXT, "targetAudience" TEXT, targetKeywords TEXT, createdBy TEXT);
CREATE TABLE "Diagnostic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pipelineLog" TEXT NOT NULL DEFAULT '[]',
    "currentStructure" TEXT,
    "gaps" TEXT,
    "cannibalization" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Diagnostic_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "position" REAL NOT NULL DEFAULT 0,
    "pageUrl" TEXT,
    "searchVolume" INTEGER,
    "kd" INTEGER,
    "cpc" REAL,
    "competition" REAL,
    "competitionLevel" TEXT,
    "intent" TEXT,
    "source" TEXT NOT NULL DEFAULT 'gsc',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "serpFeatures" TEXT,
    CONSTRAINT "Keyword_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SerpSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SerpSnapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SerpResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "keywordId" TEXT,
    "hasFeaturedSnippet" BOOLEAN NOT NULL DEFAULT false,
    "ownsFeaturedSnippet" BOOLEAN NOT NULL DEFAULT false,
    "hasPaa" BOOLEAN NOT NULL DEFAULT false,
    "paaQuestions" TEXT NOT NULL DEFAULT '[]',
    "hasKnowledgePanel" BOOLEAN NOT NULL DEFAULT false,
    "hasVideoResults" BOOLEAN NOT NULL DEFAULT false,
    "hasLocalPack" BOOLEAN NOT NULL DEFAULT false,
    "hasImagePack" BOOLEAN NOT NULL DEFAULT false,
    "hasSitelinks" BOOLEAN NOT NULL DEFAULT false,
    "hasAiOverview" BOOLEAN NOT NULL DEFAULT false,
    "topCompetitors" TEXT NOT NULL DEFAULT '[]',
    "serpFeaturesList" TEXT NOT NULL DEFAULT '[]',
    "rawResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SerpResult_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SerpResult_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentMapId" TEXT NOT NULL,
    "keywordId" TEXT,
    "pillarName" TEXT NOT NULL,
    "pillarKeyword" TEXT NOT NULL,
    "clusterName" TEXT NOT NULL,
    "clusterKeyword" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kd" INTEGER,
    "competition" TEXT,
    "cpc" REAL,
    "searchVolume" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "paaQuestions" TEXT NOT NULL DEFAULT '[]',
    "serpElements" TEXT NOT NULL DEFAULT '[]',
    "opportunityScore" REAL NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentPiece_contentMapId_fkey" FOREIGN KEY ("contentMapId") REFERENCES "ContentMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentPiece_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "AoeStrategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AoeStrategy_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AoeStrategyItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "targetQuery" TEXT NOT NULL,
    "targetEngine" TEXT NOT NULL,
    "currentPresence" TEXT NOT NULL DEFAULT 'none',
    "currentSnippet" TEXT,
    "recommendedContent" TEXT NOT NULL,
    "contentFormat" TEXT NOT NULL,
    "optimizationTips" TEXT NOT NULL DEFAULT '[]',
    "estimatedImpact" TEXT NOT NULL DEFAULT 'medium',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AoeStrategyItem_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "AoeStrategy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PageOptimization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentMapId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pageTitle" TEXT,
    "primaryKeyword" TEXT NOT NULL,
    "relatedKeywords" TEXT NOT NULL DEFAULT '[]',
    "currentPosition" REAL NOT NULL,
    "currentClicks" INTEGER NOT NULL DEFAULT 0,
    "currentImpressions" INTEGER NOT NULL DEFAULT 0,
    "currentCtr" REAL NOT NULL DEFAULT 0,
    "potentialPosition" REAL,
    "potentialTrafficGain" INTEGER,
    "issueType" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL DEFAULT '[]',
    "reasoning" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "impact" TEXT NOT NULL DEFAULT 'medium',
    "isQuickWin" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageOptimization_contentMapId_fkey" FOREIGN KEY ("contentMapId") REFERENCES "ContentMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SerpAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pipelineLog" TEXT NOT NULL DEFAULT '[]',
    "serpPerformance" TEXT,
    "competitorGap" TEXT,
    "icpAlignment" TEXT,
    "opportunities" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SerpAnalysis_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PageAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pipelineLog" TEXT NOT NULL DEFAULT '[]',
    "auditData" TEXT,
    "quickWins" TEXT,
    "recommendations" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageAudit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ContentMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "diagnosticId" TEXT,
    "name" TEXT NOT NULL,
    "quarter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pipelineLog" TEXT NOT NULL DEFAULT '[]',
    "mapData" TEXT,
    "briefs" TEXT,
    "reviewResult" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "keywordPool" TEXT,
    CONSTRAINT "ContentMap_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "weekOf" TEXT NOT NULL,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalImpressions" INTEGER NOT NULL DEFAULT 0,
    "avgCtr" REAL NOT NULL DEFAULT 0,
    "avgPosition" REAL NOT NULL DEFAULT 0,
    "top3Count" INTEGER NOT NULL DEFAULT 0,
    "top10Count" INTEGER NOT NULL DEFAULT 0,
    "top20Count" INTEGER NOT NULL DEFAULT 0,
    "top50Count" INTEGER NOT NULL DEFAULT 0,
    "totalKeywords" INTEGER NOT NULL DEFAULT 0,
    "trafficValue" REAL NOT NULL DEFAULT 0,
    "keywordPositions" TEXT NOT NULL DEFAULT '[]',
    "contentPublished" INTEGER NOT NULL DEFAULT 0,
    "contentRanking" INTEGER NOT NULL DEFAULT 0,
    "aeoActionsDone" INTEGER NOT NULL DEFAULT 0,
    "aeoActionsTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceSnapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE BrandMember (id TEXT PRIMARY KEY, userId TEXT NOT NULL, brandId TEXT NOT NULL, role TEXT DEFAULT "viewer", FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE, FOREIGN KEY (brandId) REFERENCES Brand(id) ON DELETE CASCADE, UNIQUE(userId, brandId));
CREATE TABLE User (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, name TEXT NOT NULL, role TEXT DEFAULT "user", isActive INTEGER DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
CREATE TABLE Session (id TEXT PRIMARY KEY, userId TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL, FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE);
CREATE TABLE ActivityLog (id TEXT PRIMARY KEY, userId TEXT NOT NULL, brandId TEXT, action TEXT NOT NULL, details TEXT, createdAt TEXT NOT NULL, FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX "ApiCache_cacheKey_key" ON "ApiCache"("cacheKey");
CREATE UNIQUE INDEX "Keyword_brandId_query_key" ON "Keyword"("brandId", "query");
CREATE UNIQUE INDEX "PerformanceSnapshot_brandId_weekOf_key" ON "PerformanceSnapshot"("brandId", "weekOf");