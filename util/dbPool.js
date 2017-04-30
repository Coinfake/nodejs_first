/**
 * 在连接池中获取Connection
 * @param cb
 * @returns {*}
 */

Pool.prototype.getConnection = function (cb) {
    //本地加的日志
    console.log("getConnection _allConnections.length: %j, _freeConnections.length: %j", this._allConnections.length, this._freeConnections.length);

    //池关闭检查
    if (this._closed) {
        return process.nextTick(function () {
            return cb(new Error('Pool is closed.'));
        });
    }

    var connection;
    //检查可用Connection，大于0直接从池中出栈并返回
    if (this._freeConnections.length > 0) {
        connection = this._freeConnections.shift();
        return process.nextTick(function () {
            return cb(null, connection);
        });
    }

    //检查连接数是否超过上限（默认10），没有超过则创建（真正的CreateConnection）
    if (this.config.connectionLimit === 0 || this._allConnections.length < this.config.connectionLimit) {
        connection = new PoolConnection(this, { config: this.config.connectionConfig });

        //新创建的连接入栈池中
        this._allConnections.push(connection);

        //验证新创建的Connection是否可用
        return connection.connect(function (err) {
            if (this._closed) {
                return cb(new Error('Pool is closed.'));
            }
            if (err) {
                return cb(err);
            }

            this.emit('connection', connection);
            return cb(null, connection);
        }.bind(this));
    }

    //检查是否允许排队等待（默认True），False时直接抛错
    if (!this.config.waitForConnections) {
        return process.nextTick(function () {
            return cb(new Error('No connections available.'));
        });
    }

    //检查排队人数是否超过上限（默认0，无限）
    if (this.config.queueLimit && this._connectionQueue.length >= this.config.queueLimit) {
        return cb(new Error('Queue limit reached.'));
    }

    //开始排队
    this._connectionQueue.push(cb);
};

/**
 * 释放Connection
 * @param connection
 */
Pool.prototype.releaseConnection = function (connection) {
    var cb;
    //非连接池模式处理
    if (!connection._pool) {
        //如果有人排队
        if (this._connectionQueue.length) {
            //出栈一个排队回调
            cb = this._connectionQueue.shift();
            //调用getConnection返回Connection给予回调使用
            process.nextTick(this.getConnection.bind(this, cb));
        }
    }
    /**
     *连接池模式处理 有人排队
     */
    else if (this._connectionQueue.length) {
        cb = this._connectionQueue.shift();
        //将释放的connection直接给予排队列表的第一个人使用
        process.nextTick(cb.bind(null, null, connection));
    }
    //连接池模式处理 无人排队
    else {
        //将释放的connection加入可用连接数组，待使用
        this._freeConnections.push(connection);
        //我本地加的日志
        console.log("releaseConnection _allConnections.length: %j, _freeConnections.length: %j", this._allConnections.length, this._freeConnections.length);
    }
};