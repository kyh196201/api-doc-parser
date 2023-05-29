const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const { toPascalCase } = require('js-convert-case');
const readline = require('readline');

// #region paths
// 현재 실행 중인 파일의 디렉토리 경로
const currentDir = __dirname;

// src와 같은 레벨에 contents 디렉토리 경로 생성
const contentsDir = path.resolve(currentDir, '../contents');

// src와 같은 레벨에 types 디렉토리 경로 생성
const typesDir = path.resolve(currentDir, '../types');
// #endregion

// #region readlin
// readline 인터페이스 생성
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// pageId를 입력받는 함수
function getPageIdFromUser() {
  return new Promise((resolve) => {
    rl.question('pageId를 입력해주세요: ', (pageId) => {
      // rl.close();
      resolve(pageId);
    });
  });
}

// 파일 이름을 입력받는 함수
function getFilenameFromUser() {
  return new Promise((resolve) => {
    rl.question('파일 이름을 입력해주세요: ', (filename) => {
      rl.close();
      resolve(filename);
    });
  });
}
// #endregion

// #region constants
// Confluence API 엔드포인트와 필요한 인증 정보 설정
const API_TOKEN = process.env.API_TOKEN;
const BASE_URL = process.env.API_DOMAIN;
const USER_EMAIL = process.env.USER_EMAIL;

const bracketRegex = /^[a-zA-Z]+\[\]$/;

// api 타입 변환 매핑
const apiTypeMappings = {
  any: 'any',
  string: 'string',
  html: 'string',
  number: 'number',
  float: 'number',
  boolean: 'boolean',
  date: 'APIDate',
  datetime: 'APIDateTime',
  enum: 'APICode<string>',
  price: 'APIMoney',
  ['array<enum>']: 'APICode<string>[]',
};

// 인터페이스 타입 변환 매핑
const interfaceTypeMappings = {
  request: 'payload',
  responsedata: 'response',
  pathparameter: 'pathParameter',
};
// #endregion

// #region utils
function capitalizeFirstLetter(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getApiName(apiUrl = '') {
  const names = apiUrl.split('/');
  const lastName = names[names.length - 1];

  if (lastName.charAt(0) === '{') {
    return toPascalCase(names[names.length - 2]);
  }

  return toPascalCase(lastName);
}

// type name 반환
function getTypeName(type) {
  let nullable = false;
  type = type.toLowerCase();

  // #으로 시작하는 경우 null 허용 타입으로 변환
  if (type[0] === '#') {
    type = type.substr(1);
    nullable = true;
  }

  const typeName = apiTypeMappings[type] || 'any';

  if (nullable) {
    return `${typeName} | null`;
  }

  return typeName;
}

// 필요한 인덱스를 찾는 도우미 함수
function findIndexByHeaderText($, row, headerText) {
  const tds = row.children();
  let index = -1;

  tds.each(function (i, el) {
    const text = $(this).find('strong').text().trim();

    if (text === headerText) {
      index = i;
      return false;
    }
  });

  return index;
}

// api method, url, name 반환
function parseApiInfo(text = '') {
  const regex = /^(GET|POST|PUT|DELETE|PATCH)\s+(.*?)\s+-\s+(.*)$/;
  const match = text.match(regex);

  if (!match) {
    console.error(`올바른 형식의 API 정보가 아닙니다. text: ${text}`);

    return {
      httpMethod: '',
      apiUrl: '',
      apiTitle: text,
      apiName: '',
    };
  }

  const httpMethod = capitalizeFirstLetter(match[1].toLocaleLowerCase());
  const apiUrl = match[2];
  const apiTitle = match[3];
  const apiName = getApiName(apiUrl);

  return {
    httpMethod,
    apiUrl,
    apiTitle,
    apiName,
  };
}
// #endregion

// 페이지 컨텐츠 가져오기
async function getPageContent(pageId) {
  const filePath = `${contentsDir}/content_${pageId}.json`;

  try {
    // contents 디렉토리가 존재하지 않는 경우 생성
    if (!fs.existsSync(contentsDir)) {
      fs.mkdirSync(contentsDir);
    }

    // 파일이 존재하는 경우 파일에서 컨텐츠 읽어오기
    // NOTI: api 문서가 업데이트될 경우 읽어오지 못할 수 있음
    // api 문서가 업데이트되었을 경우 해당 파일 삭제 필요
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }

    // https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/#api-wiki-rest-api-content-get
    // 파일이 존재하지 않는 경우 API 요청 보내기
    const response = await axios.get(`${BASE_URL}/content/${pageId}`, {
      params: {
        expand: 'body.view',
      },
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${USER_EMAIL}:${API_TOKEN}`
        ).toString('base64')}`,
        Accept: 'application/json',
      },
    });

    const content = response.data.body.view.value;

    // 컨텐츠를 파일에 저장
    fs.writeFileSync(filePath, JSON.stringify(content));

    return content;
  } catch (error) {
    console.error('페이지 컨텐츠 가져오기 오류:', error);
    throw error;
  }
}

// 인터페이스 코드 생성
function generateInterfaceCode(content) {
  const $ = cheerio.load(content);
  const interfaces = [];

  // api 문서 각 항목들
  $('.plugin-tabmeta-details').each(function () {
    const apiDoc = $(this);

    const apiHeading = apiDoc.find('h1[id]').text().trim();

    const { apiTitle, httpMethod, apiUrl, apiName } = parseApiInfo(apiHeading);

    // 테이블 찾기 (Request, Response Data, Path Parameter, Error Code)
    const tables = apiDoc.find('.confluenceTable');

    if (!tables.length) {
      return;
    }

    tables.each(function () {
      const rows = $(this).find('tbody tr');

      if (rows.length < 3) {
        return;
      }

      // #region 1. 인터페이스 이름 설정
      const interfaceTypeRow = rows.eq(0);

      // TODO: error code 테이블일 경우
      if (interfaceTypeRow.find('.confluenceTh').length > 1) {
        // const errorName = `${apiTitle}ErrorCode`;
        return;
      }

      const typeText = rows
        .eq(0)
        .find('.confluenceTh > p > strong')
        .text()
        .trim()
        .replace(/\s/g, '')
        .toLowerCase();

      const interfaceType = toPascalCase(
        interfaceTypeMappings[typeText] || 'payload'
      );

      const interfaceName = `${httpMethod}${apiName}${interfaceType}`;
      //#endregion

      // #region 2. index 설정
      const indexRow = rows.eq(1);

      const parameterIndex = findIndexByHeaderText($, indexRow, 'Parameter');
      const descriptionIndex = findIndexByHeaderText(
        $,
        indexRow,
        'Parameter Description'
      );
      const typeIndex = findIndexByHeaderText($, indexRow, 'Type');
      const requiredIndex = findIndexByHeaderText($, indexRow, 'Required');
      // #endregion

      // #region 3. 인터페이스 만들기
      const lines = rows.slice(2).map(function () {
        const tds = $(this).children();
        const description = tds.eq(descriptionIndex).find('p').text().trim();
        const required = tds.eq(requiredIndex).find('p').text().trim() || 'N';
        let parameter = tds.eq(parameterIndex).find('p').text().trim();
        let typeName = tds.eq(typeIndex).find('p').text().trim() || 'any';

        if (!parameter) {
          return null;
        }

        if (bracketRegex.test(parameter)) {
          parameter = parameter.replace(/\[\]/g, '');
        }

        typeName = getTypeName(typeName);

        const isRequired =
          interfaceType === 'Request' ? required === 'Y' : true;

        return `/** ${description} */
	${parameter}${isRequired ? '' : '?'}: ${typeName};`;
      });

      if (lines.length) {
        const interfaceCode = `// #region ${apiTitle}
interface ${interfaceName} {
	${lines.get().join('\n\n')}
}
// #endregion`;
        interfaces.push(interfaceCode);
      }
      // #endregion
    });
  });

  return interfaces.join('\n\n');
}

// 인터페이스 코드를 파일에 저장
function saveInterfaceCode(interfaceCodes, fileFullName) {
  try {
    if (!fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDir);
    }

    const filePath = `${typesDir}/${fileFullName}`;

    fs.writeFileSync(filePath, interfaceCodes);
    console.log('인터페이스 코드가 파일에 저장되었습니다.');
  } catch (err) {
    console.error('인터페이스 코드 저장 중 오류 발생:', err);
  }
}

// 실행 함수
async function run() {
  const pageId = await getPageIdFromUser();
  const filename = await getFilenameFromUser();
  const content = await getPageContent(pageId);
  const interfaceCodes = generateInterfaceCode(content);

  console.log('interfaceCodes', interfaceCodes);

  const fileFullName = `${filename}.types.ts`;
  saveInterfaceCode(interfaceCodes, fileFullName);
}

// 실행
run().catch((error) => {
  console.error(error);
});
