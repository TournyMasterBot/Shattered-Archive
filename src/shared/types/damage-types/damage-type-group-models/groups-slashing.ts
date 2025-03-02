import IDamageType from "@shared/types/damage-types/damage-type-interface";
import Claw from "@shared/types/ability-types/skills/Claw";
import Cleave from "@shared/types/damage-types/damage-type-models/cleave";
import Scratch from "@shared/types/damage-types/damage-type-models/scratch"
import Slash from "@shared/types/damage-types/damage-type-models/slash"
import Slice from "@shared/types/damage-types/damage-type-models/slice"
import Whip from "@shared/types/damage-types/damage-type-models/whip"

export class SlashingDamageTypes {
    public static Claw = Claw.GetInstance().Get<Claw>();
    public static Cleave = Cleave.GetInstance().Get<Cleave>();
    public static Scratch = Scratch.GetInstance().Get<Scratch>();
    public static Slash = Slash.GetInstance().Get<Slash>();
    public static Slice = Slice.GetInstance().Get<Slice>();
    public static Whip = Whip.GetInstance().Get<Whip>();
    
    public getInstanceByName(name: string): IDamageType | undefined {
        for (const key in SlashingDamageTypes) {
            if (SlashingDamageTypes.hasOwnProperty(key)) {
                const instance = (SlashingDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in SlashingDamageTypes) {
            if (SlashingDamageTypes.hasOwnProperty(key)) {
                const instance = (SlashingDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default SlashingDamageTypes;