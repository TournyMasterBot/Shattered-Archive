import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Pugil from "@shared/types/ability-types/skills/pugil";
import Roundhouse from "@shared/types/ability-types/skills/roundhouse";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Parry from "@shared/types/ability-types/skills/parry";
import DangerSense from "@shared/types/ability-types/skills/danger-sense";
import WarHymns from "../groups-songs/war-hymns";
import HymnsOfLife from "../groups-songs/hymns-of-life";

export class BardDefault implements IAbilityGroup {
  static instance: BardDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BardDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...WarHymns.GetInstance().Get<WarHymns>().abilities,
      ...HymnsOfLife.GetInstance().Get<HymnsOfLife>().abilities,
      new Dodge(),
      new Pugil(),
      new Roundhouse(),
      new EnhancedDamage(),
      new SecondAttack(),
      new Parry(),
      new DangerSense(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BardDefault {
    if (!BardDefault.instance) {
      BardDefault.instance = new BardDefault();
    }
    return BardDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BardDefault.GetInstance() as T;
  }
}

export default BardDefault;
