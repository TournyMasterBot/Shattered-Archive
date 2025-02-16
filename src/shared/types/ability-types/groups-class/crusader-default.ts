import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/mace";
import Flail from "@shared/types/ability-types/skills/flail";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Healing from "../groups-spells/healing";
import Transportation from "../groups-spells/transportation";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Maladictions from "../groups-spells/maladictions";
import Weather from "../groups-spells/weather";
import Worship from "../groups-spells/worship";
import Detection from "../groups-spells/detection";
import Protective from "../groups-spells/protective";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import Unhorse from "@shared/types/ability-types/skills/unhorse";
import Riding from "@shared/types/ability-types/skills/riding";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Parry from "@shared/types/ability-types/skills/parry";
import Martyr from "@shared/types/ability-types/skills/martyr";
import Rear from "@shared/types/ability-types/skills/rear";

export class CrusaderDefault implements IAbilityGroup {
    static instance: CrusaderDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.CrusaderDefault;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            ...Curative.GetInstance().Get<Curative>().abilities,
            ...Healing.GetInstance().Get<Healing>().abilities,
            ...Transportation.GetInstance().Get<Transportation>().abilities,
            ...Benedictions.GetInstance().Get<Benedictions>().abilities,
            ...Maladictions.GetInstance().Get<Maladictions>().abilities,
            ...Weather.GetInstance().Get<Weather>().abilities,
            ...Worship.GetInstance().Get<Worship>().abilities,
            ...Detection.GetInstance().Get<Detection>().abilities,
            ...Protective.GetInstance().Get<Protective>().abilities,
            DualWield.GetInstance().Get(),
            Unhorse.GetInstance().Get(),
            Riding.GetInstance().Get(),
            ShieldBlock.GetInstance().Get(),
            Parry.GetInstance().Get(),
            Martyr.GetInstance().Get(),
            Rear.GetInstance().Get(),
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): CrusaderDefault {
        if (!CrusaderDefault.instance) {
            CrusaderDefault.instance = new CrusaderDefault();
        }
        return CrusaderDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CrusaderDefault.GetInstance() as T;
    }
}

export default CrusaderDefault;
