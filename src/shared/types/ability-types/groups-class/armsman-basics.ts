import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sword from "@shared/types/ability-types/skills/sword";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";

export class ArmsmanBasics implements IAbilityGroup {
    static instance: ArmsmanBasics;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.ArmsmanBasics;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            Sword.GetInstance().Get<Sword>(),
            SecondAttack.GetInstance().Get<SecondAttack>(),
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): ArmsmanBasics {
        if (!ArmsmanBasics.instance) {
            ArmsmanBasics.instance = new ArmsmanBasics();
        }
        return ArmsmanBasics.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ArmsmanBasics.GetInstance() as T;
    }
}

export default ArmsmanBasics;
