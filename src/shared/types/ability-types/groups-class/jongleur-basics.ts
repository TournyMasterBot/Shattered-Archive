import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Staff from "@shared/types/ability-types/skills/staff";

export class JongleurBasics implements IAbilityGroup {
    static instance: JongleurBasics;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.JongleurBasics;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            Staff.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): JongleurBasics {
        if (!JongleurBasics.instance) {
            JongleurBasics.instance = new JongleurBasics();
        }
        return JongleurBasics.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return JongleurBasics.GetInstance() as T;
    }
}

export default JongleurBasics;
