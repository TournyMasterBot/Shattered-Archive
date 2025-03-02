import Envenom from "@shared/types/ability-types/skills/Envenom";
import Lifebane from "@shared/types/ability-types/skills/Lifebane";
import Poison from "@shared/types/ability-types/spells/Poison";
import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class PoisonDamageTypes {
    public static Poison = Poison.GetInstance().Get<Poison>();
    public static Lifebane = Lifebane.GetInstance().Get<Lifebane>();
    public static Envenom = Envenom.GetInstance().Get<Envenom>();
    
    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in PoisonDamageTypes) {
            if (PoisonDamageTypes.hasOwnProperty(key)) {
                const instance = (PoisonDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in PoisonDamageTypes) {
            if (PoisonDamageTypes.hasOwnProperty(key)) {
                const instance = (PoisonDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default PoisonDamageTypes;