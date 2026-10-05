export enum DataStatus {
	SUCCESS = "success",
	WARN = "warn",
	ERROR = "error",
}

export interface DataSuccess<V> {
	status: DataStatus.SUCCESS;
	value: V;
}

export interface DataWarn {
	status: DataStatus.WARN;
	warn: Error;
}

export interface DataError {
	status: DataStatus.ERROR;
	error: Error;
}

export type Data<V> = DataSuccess<V> | DataWarn | DataError;

export type DataValue<D extends Data<unknown>> =
	D extends DataSuccess<infer V> ? V : undefined;

export const success = <V>(value: V): DataSuccess<V> => ({
	status: DataStatus.SUCCESS,
	value,
});
export const warn = (warn: Error): DataWarn => ({
	status: DataStatus.WARN,
	warn,
});
