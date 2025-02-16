import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SongOfHealing from "../songs/song-of-healing";
import TorchBurns from "../songs/torch-burns";
import WakeTheDead from "../songs/wake-the-dead";
import MarriageSong from "../songs/marriage-song";
import TravelTune from "../songs/travel-tune";
import BottlesOfBeer from "../songs/bottles-of-beer";
import RevealAll from "../songs/reveal-all";
import SongOfPeace from "../songs/song-of-peace";
import StoneFountain from "../songs/stone-fountain";
import ShieldOfWords from "../songs/shield-of-words";
import RoostersCrow from "../songs/roosters-crow";

export class HymnsOfLife implements IAbilityGroup {
  static instance: HymnsOfLife;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.HymnsOfLife;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilities = [
      SongOfHealing.GetInstance().Get(),
      TorchBurns.GetInstance().Get(),
      WakeTheDead.GetInstance().Get(),
      MarriageSong.GetInstance().Get(),
      TravelTune.GetInstance().Get(),
      BottlesOfBeer.GetInstance().Get(),
      RevealAll.GetInstance().Get(),
      SongOfPeace.GetInstance().Get(),
      StoneFountain.GetInstance().Get(),
      ShieldOfWords.GetInstance().Get(),
      RoostersCrow.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): HymnsOfLife {
    if (!HymnsOfLife.instance) {
      HymnsOfLife.instance = new HymnsOfLife();
    }
    return HymnsOfLife.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HymnsOfLife.GetInstance() as T;
  }
}

export default HymnsOfLife;
