import IDamageType from "@shared/types/damage-types/damage-type-interface";;
import Flame from "@shared/types/damage-types/damage-type-models/flame";
import FlamingBite from "@shared/types/damage-types/damage-type-models/flaming-bite";

export class FireDamageTypes {
    public static Flame = Flame.GetInstance().Get<Flame>();
    public static FlamingBite = FlamingBite.GetInstance().Get<FlamingBite>();
    
    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in FireDamageTypes) {
            if (FireDamageTypes.hasOwnProperty(key)) {
                const instance = (FireDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in FireDamageTypes) {
            if (FireDamageTypes.hasOwnProperty(key)) {
                const instance = (FireDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default FireDamageTypes;