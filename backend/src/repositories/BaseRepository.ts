/**
 * 基础 Repository 类
 * 提供通用的数据库操作方法
 */

import { getDatabase } from '../config/database';

export class BaseRepository {
  protected db: ReturnType<typeof getDatabase>;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * 执行查询，返回所有结果
   */
  protected async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.all(sql, params) as Promise<T[]>;
  }

  /**
   * 执行查询，返回单个结果
   */
  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.db.get(sql, params) as Promise<T | undefined>;
  }

  /**
   * 执行 INSERT、UPDATE、DELETE 操作
   */
  protected async execute(sql: string, params: any[] = []): Promise<void> {
    return this.db.run(sql, params);
  }

  /**
   * 构建 WHERE 条件子句
   */
  protected buildWhereClause(conditions: Record<string, any>): { clause: string; params: any[] } {
    const keys = Object.keys(conditions);
    if (keys.length === 0) {
      return { clause: '', params: [] };
    }

    const clauses = keys.map(key => `${key} = ?`);
    const params = keys.map(key => conditions[key]);

    return {
      clause: `WHERE ${clauses.join(' AND ')}`,
      params
    };
  }

  /**
   * 构建分页参数
   */
  protected buildPagination(limit?: number, offset?: number): string {
    let pagination = '';
    if (limit) {
      pagination += ` LIMIT ${limit}`;
    }
    if (offset) {
      pagination += ` OFFSET ${offset}`;
    }
    return pagination;
  }

  /**
   * 构建排序参数
   */
  protected buildOrderBy(orderBy?: string, direction: 'ASC' | 'DESC' = 'ASC'): string {
    if (!orderBy) return '';
    return ` ORDER BY ${orderBy} ${direction}`;
  }

  /**
   * 验证日期格式 YYYY-MM-DD
   */
  protected validateDateFormat(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  }

  /**
   * 验证数值范围
   */
  protected validateNumber(value: any, min: number, max: number): boolean {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
  }
}
