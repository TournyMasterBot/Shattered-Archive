import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Battlemagic from "../groups-spells/battlemagic";
import Beguiling from "../groups-spells/beguiling";
import Combat from "../groups-spells/combat";
import Detection from "../groups-spells/detection";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";
import Astrology from "@shared/types/ability-types/skills/astrology";

export class BattlemageDefault implements IAbilityGroup {
    static instance: BattlemageDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.BattlemageDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...Combat.GetInstance().Get<Combat>().abilities,
            ...Transportation.GetInstance().Get<Transportation>().abilities,
            ...Protective.GetInstance().Get<Protective>().abilities,
            ...Enhancement.GetInstance().Get<Enhancement>().abilities,
            ...Beguiling.GetInstance().Get<Beguiling>().abilities,
            ...Detection.GetInstance().Get<Detection>().abilities,
            ...Battlemagic.GetInstance().Get<Battlemagic>().abilities,
            new Astrology()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): BattlemageDefault {
        if (!BattlemageDefault.instance) {
            BattlemageDefault.instance = new BattlemageDefault();
        }
        return BattlemageDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return BattlemageDefault.GetInstance() as T;
    }
}

export default BattlemageDefault;
