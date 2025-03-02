import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/Mace";
import Flail from "@shared/types/ability-types/skills/Flail";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Healing from "@shared/types/ability-types/groups-spells/Healing";
import Transportation from "@shared/types/ability-types/groups-spells/Transportation";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Maladictions from "@shared/types/ability-types/groups-spells/Maladictions";
import Weather from "@shared/types/ability-types/groups-spells/Weather";
import Detection from "@shared/types/ability-types/groups-spells/Detection";
import Protective from "@shared/types/ability-types/groups-spells/Protective";
import DualWield from "@shared/types/ability-types/skills/DualWield";
import Unhorse from "@shared/types/ability-types/skills/Unhorse";
import Riding from "@shared/types/ability-types/skills/Riding";
import ShieldBlock from "@shared/types/ability-types/skills/ShieldBlock";
import Parry from "@shared/types/ability-types/skills/Parry";
import Martyr from "@shared/types/ability-types/skills/Martyr";
import Rear from "@shared/types/ability-types/skills/Rear";
import ServerCache from "@shared/cache/server-cache";
import Worship from "@shared/types/ability-types/groups-spells/Worship";

export class CrusaderDefault implements IAbilityGroup {
  static instance: CrusaderDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.CrusaderDefault;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      ...Curative.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Worship.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      DualWield.GetInstance(),
      Unhorse.GetInstance(),
      Riding.GetInstance(),
      ShieldBlock.GetInstance(),
      Parry.GetInstance(),
      Martyr.GetInstance(),
      Rear.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): CrusaderDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CrusaderDefault.GetInstance() as T;
  }
}

export default CrusaderDefault;
