import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Parry from "@shared/types/ability-types/skills/parry";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Rescue from "@shared/types/ability-types/skills/rescue";
import SkaldChants from "../groups-songs/skald-chants";

export class SkaldDefault implements IAbilityGroup {
    static instance: SkaldDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.SkaldDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...SkaldChants.GetInstance().Get<SkaldChants>().abilities,
            Dodge.GetInstance().Get(),
            SecondAttack.GetInstance().Get(),
            Parry.GetInstance().Get(),
            ThirdAttack.GetInstance().Get(),
            ShieldBlock.GetInstance().Get(),
            Rescue.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): SkaldDefault {
        if (!SkaldDefault.instance) {
            SkaldDefault.instance = new SkaldDefault();
        }
        return SkaldDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SkaldDefault.GetInstance() as T;
    }
}

export default SkaldDefault;
