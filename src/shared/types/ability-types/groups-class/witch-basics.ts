import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Staff from "@shared/types/ability-types/skills/staff";

export class WitchBasics implements IAbilityGroup {
    static instance: WitchBasics;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.WitchBasics;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            Dagger.GetInstance().Get(),
            Staff.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): WitchBasics {
        if (!WitchBasics.instance) {
            WitchBasics.instance = new WitchBasics();
        }
        return WitchBasics.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return WitchBasics.GetInstance() as T;
    }
}

export default WitchBasics;
