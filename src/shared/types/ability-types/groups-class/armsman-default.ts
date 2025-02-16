import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EnhancedReactions from "@shared/types/ability-types/skills/enhanced-reactions";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import Grip from "@shared/types/ability-types/skills/grip";
import Parry from "@shared/types/ability-types/skills/parry";
import Weaponsmaster from "../groups-skills/weaponsmaster";
import MasterySword from "../groups-skills/mastery-sword";

export class ArmsmanDefault implements IAbilityGroup {
    private static instance: ArmsmanDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.ArmsmanDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...Weaponsmaster.GetInstance().Get<Weaponsmaster>().abilities,
            ...MasterySword.GetInstance().Get<MasterySword>().abilities,
            EnhancedReactions.GetInstance().Get(),
            DualWield.GetInstance().Get(),
            Grip.GetInstance().Get(),
            Parry.GetInstance().Get(),
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): ArmsmanDefault {
        if (!ArmsmanDefault.instance) {
            ArmsmanDefault.instance = new ArmsmanDefault();
        }
        return ArmsmanDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ArmsmanDefault.GetInstance() as T;
    }
}

export default ArmsmanDefault;
