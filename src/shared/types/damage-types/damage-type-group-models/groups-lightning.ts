import IDamageType from "@shared/types/damage-types/damage-type-interface";;
import Shock from "@shared/types/damage-types/damage-type-models/shock";
import ShockingBite from "@shared/types/damage-types/damage-type-models/shocking-bite";

export class LightningDamageTypes {
    public static Shock = Shock.GetInstance().Get<Shock>();
    public static ShockingBite = ShockingBite.GetInstance().Get<ShockingBite>();
    
    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in LightningDamageTypes) {
            if (LightningDamageTypes.hasOwnProperty(key)) {
                const instance = (LightningDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in LightningDamageTypes) {
            if (LightningDamageTypes.hasOwnProperty(key)) {
                const instance = (LightningDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default LightningDamageTypes;