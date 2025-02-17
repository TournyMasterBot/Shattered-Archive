import IDamageType from "@shared/types/damage-types/damage-type-interface";;
import IDamageTypeGroup from "@shared/types/damage-types/damage-type-group-interface";
import Bite from "@shared/types/damage-types/damage-type-models/bite";
import Charge from "@shared/types/damage-types/damage-type-models/charge";
import Grep from "@shared/types/damage-types/damage-type-models/grep";
import Peck from "@shared/types/damage-types/damage-type-models/peck";
import Pierce from "@shared/types/damage-types/damage-type-models/pierce";
import Stab from "@shared/types/damage-types/damage-type-models/stab";
import Sting from "@shared/types/damage-types/damage-type-models/sting";
import Thrust from "@shared/types/damage-types/damage-type-models/thrust";

export class PiercingDamageTypes implements IDamageTypeGroup<PiercingDamageTypes> {
    public static Bite = Bite.GetInstance().Get<Bite>();
    public static Charge = Charge.GetInstance().Get<Charge>();
    public static Grep = Grep.GetInstance().Get<Grep>();
    public static Peck = Peck.GetInstance().Get<Peck>();
    public static Pierce = Pierce.GetInstance().Get<Pierce>();
    public static Stab = Stab.GetInstance().Get<Stab>();
    public static Sting = Sting.GetInstance().Get<Sting>();
    public static Thrust = Thrust.GetInstance().Get<Thrust>();

    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in PiercingDamageTypes) {
            if (PiercingDamageTypes.hasOwnProperty(key)) {
                const instance = (PiercingDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in PiercingDamageTypes) {
            if (PiercingDamageTypes.hasOwnProperty(key)) {
                const instance = (PiercingDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default PiercingDamageTypes;