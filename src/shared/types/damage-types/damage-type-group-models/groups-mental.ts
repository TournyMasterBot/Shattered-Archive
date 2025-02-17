import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class MentalDamageTypes {
    // TODO
    
    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in MentalDamageTypes) {
            if (MentalDamageTypes.hasOwnProperty(key)) {
                const instance = (MentalDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in MentalDamageTypes) {
            if (MentalDamageTypes.hasOwnProperty(key)) {
                const instance = (MentalDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default MentalDamageTypes;