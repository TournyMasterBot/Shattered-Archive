import IDamageType from "@shared/types/damage-types/damage-type-interface";;
import Chill from "@shared/types/damage-types/damage-type-models/chill";
import FreezingBite from "@shared/types/damage-types/damage-type-models/freezing-bite";

export class ColdDamageTypes {
    public static Chill = Chill.GetInstance().Get<Chill>();
    public static FreezingBite = FreezingBite.GetInstance().Get<FreezingBite>();
    
    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in ColdDamageTypes) {
            if (ColdDamageTypes.hasOwnProperty(key)) {
                const instance = (ColdDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in ColdDamageTypes) {
            if (ColdDamageTypes.hasOwnProperty(key)) {
                const instance = (ColdDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default ColdDamageTypes;